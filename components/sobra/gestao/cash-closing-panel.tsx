import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import type { CashOpening } from "@/lib/business/cash-domain";
import type {
  CashCloseResult,
  CashClosingState,
} from "@/lib/business/cash-closing-domain";
import {
  Body,
  Button,
  C,
  Card,
  F,
  Notice,
  SectionTitle,
} from "@/components/sobra/ui";
import { CashClosingForm } from "@/components/sobra/gestao/cash-closing-form";
import { CashClosingReview as CashClosingReviewScreen } from "@/components/sobra/gestao/cash-closing-review";
import {
  buildCashClosingReview,
  cashClosingCanRecover,
  cashClosingFormBelongsToOpening,
  cashClosingReviewMatchesActor,
  cashClosingReviewMatchesState,
  createCashClosingIntentId,
  emptyCashClosingForm,
  type CashClosingFormValues,
  type CashClosingReview,
} from "@/lib/business/cash-closing-ui";
import { formatCents } from "@/lib/business/fuel-domain";
import { trpc } from "@/lib/trpc";

function errorDetails(error: unknown) {
  if (!error || typeof error !== "object") return { code: "", message: "" };
  const candidate = error as {
    message?: unknown;
    data?: { code?: unknown };
    shape?: { data?: { code?: unknown } };
  };
  const code = candidate.data?.code ?? candidate.shape?.data?.code;
  return {
    code: typeof code === "string" ? code : "",
    message: typeof candidate.message === "string" ? candidate.message : "",
  };
}

function isConflict(code: string) {
  return code === "CONFLICT" || code === "PRECONDITION_FAILED";
}

function isDefiniteRejection(code: string) {
  return [
    "BAD_REQUEST",
    "FORBIDDEN",
    "UNAUTHORIZED",
    "NOT_FOUND",
    "TOO_MANY_REQUESTS",
  ].includes(code);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
        paddingTop: 9,
        borderTopWidth: 1,
        borderTopColor: C.line,
      }}
    >
      <Body size={12}>{label}</Body>
      <Text
        style={{
          color: C.ink,
          fontFamily: F.bold,
          fontSize: 12,
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function CashClosingPanel({
  state,
  stateError,
  stateFetching,
  opening,
  unitName,
  actorId,
  actorName,
  allowedToClose,
  csrfReady,
  screenActive,
  refreshState,
  onClosed,
  onRecoveryPending,
}: {
  state: CashClosingState | undefined;
  stateError: boolean;
  stateFetching: boolean;
  opening: CashOpening | null;
  unitName: string;
  actorId: number;
  actorName: string;
  allowedToClose: boolean;
  csrfReady: boolean;
  screenActive: boolean;
  refreshState: () => Promise<{
    data?: CashClosingState;
    error?: unknown;
  }>;
  onClosed: (result: CashCloseResult) => void;
  onRecoveryPending: (pending: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [values, setValues] =
    useState<CashClosingFormValues>(emptyCashClosingForm);
  const [formOpeningId, setFormOpeningId] = useState<number | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [review, setReview] = useState<CashClosingReview | null>(null);
  const [formError, setFormError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [statusNotice, setStatusNotice] = useState("");
  const [requiresRefresh, setRequiresRefresh] = useState(false);
  const [uncertainResult, setUncertainResult] = useState(false);
  const [refreshingReview, setRefreshingReview] = useState(false);

  const closeCash = trpc.cash.close.useMutation({
    onSuccess: (result) => {
      setStatusNotice(
        result.replayed
          ? "O servidor confirmou o mesmo fechamento ao recuperar a intenção anterior."
          : "Fechamento confirmado pelo servidor.",
      );
      setReview(null);
      setValues(emptyCashClosingForm());
      setFormVisible(false);
      setFormError("");
      setReviewError("");
      setRequiresRefresh(false);
      setUncertainResult(false);
      onClosed(result);
      void Promise.all([
        utils.cash.closingState.invalidate(),
        utils.cash.turnSnapshot.invalidate(),
        utils.cash.position.invalidate(),
        utils.cash.closingHistory.invalidate(),
        utils.cash.movementHistory.invalidate(),
      ]);
    },
    onError: (failure) => {
      const { code, message } = errorDetails(failure);
      const alreadyUncertain = uncertainResult;
      setStatusNotice("");
      setReviewError(
        message ||
          "Não foi possível confirmar o fechamento. Os valores e a revisão foram mantidos.",
      );

      if (isConflict(code)) {
        if (
          /conta autenticada mudou|ator.{0,20}(mudou|diferente)/i.test(message)
        ) {
          if (!alreadyUncertain) {
            setRequiresRefresh(true);
            setUncertainResult(false);
          }
          setReviewError(
            alreadyUncertain
              ? "A repetição foi recusada porque a conta atual não é a original. A tentativa incerta continua preservada; volte à conta original e repita somente o mesmo payload."
              : message ||
                  "A identidade autenticada mudou. Atualize e faça uma nova revisão pela conta atual.",
          );
          return;
        }
        if (!alreadyUncertain) {
          setRequiresRefresh(true);
          setUncertainResult(false);
          setReviewError(
            message
              ? `${message} Atualize o estado e faça uma nova revisão antes de confirmar.`
              : "A revisão ficou obsoleta. Atualize o estado e faça uma nova revisão antes de confirmar.",
          );
        }
        return;
      }

      if (isDefiniteRejection(code)) {
        if (!alreadyUncertain) setUncertainResult(false);
        return;
      }

      // A conexão ou um erro interno pode ocultar um commit já confirmado. Keep
      // this exact review and UUID; do not start a second close attempt.
      setUncertainResult(true);
      setRequiresRefresh(false);
      setReviewError(
        code === "TIMEOUT"
          ? "A chamada expirou sem resposta conclusiva. O servidor pode ter fechado o turno; repita manualmente esta mesma intenção para recuperar a confirmação."
          : "Não recebemos uma resposta final do servidor. O resultado pode ser incerto; repita somente esta mesma intenção para recuperar a confirmação.",
      );
    },
  });

  const summary =
    opening && state?.activeOpening?.id === opening.id ? state.summary : null;
  const formBelongsToCurrentOpening = cashClosingFormBelongsToOpening(
    formOpeningId,
    opening?.id ?? null,
  );
  const showForm = Boolean(
    formVisible &&
    opening &&
    cashClosingFormBelongsToOpening(formOpeningId, opening.id),
  );
  const actorAvailable = Boolean(
    Number.isSafeInteger(actorId) && actorId > 0 && actorName.trim(),
  );
  const snapshotCurrent = Boolean(
    opening &&
    state &&
    !stateError &&
    !stateFetching &&
    state.activeOpening?.id === opening.id &&
    summary,
  );
  const canStartNewForm = Boolean(
    allowedToClose &&
    csrfReady &&
    screenActive &&
    actorAvailable &&
    snapshotCurrent &&
    !closeCash.isPending,
  );
  const canPrepare = Boolean(
    canStartNewForm && (!formVisible || formBelongsToCurrentOpening),
  );
  const actorMatches = Boolean(
    review && cashClosingReviewMatchesActor(review, actorId, actorName),
  );
  const canRecover = Boolean(
    review &&
    cashClosingCanRecover(
      review,
      actorId,
      actorName,
      allowedToClose,
      csrfReady,
      screenActive,
    ),
  );
  const reviewIsStale = Boolean(
    review &&
    (!cashClosingReviewMatchesState(review, state) ||
      stateError ||
      !state ||
      !allowedToClose),
  );
  const reviewNeedsRefresh = Boolean(
    review && !uncertainResult && (requiresRefresh || reviewIsStale),
  );
  const reviewBlocked = Boolean(
    review &&
    !uncertainResult &&
    (reviewNeedsRefresh ||
      stateFetching ||
      stateError ||
      !state ||
      !screenActive ||
      !allowedToClose),
  );

  useEffect(() => {
    onRecoveryPending(Boolean(review && uncertainResult));
  }, [onRecoveryPending, review, uncertainResult]);

  function startForm() {
    if (!opening || !canStartNewForm) return;
    const changingOpening =
      formOpeningId !== null && formOpeningId !== opening.id;
    if (changingOpening) setValues(emptyCashClosingForm());
    setFormOpeningId(opening.id);
    setFormVisible(true);
    setReview(null);
    setFormError("");
    setReviewError("");
    setStatusNotice("");
    setRequiresRefresh(false);
    setUncertainResult(false);
  }

  function prepareReview() {
    setFormError("");
    setReviewError("");
    setStatusNotice("");
    if (!canPrepare || !state || !summary) {
      setFormError(
        stateError
          ? "A posição mais recente falhou. Atualize o estado antes de revisar o fechamento."
          : "Aguarde a abertura ativa e o resumo completo atual do servidor, além da proteção CSRF, antes de revisar.",
      );
      return;
    }
    try {
      const nextReview = buildCashClosingReview({
        form: values,
        state,
        intentId: createCashClosingIntentId(),
        unitName,
        registerName: "Caixa principal",
        actorId,
        actorName,
      });
      setReview(nextReview);
      setFormVisible(false);
      setRequiresRefresh(false);
      setUncertainResult(false);
    } catch (failure) {
      setFormError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível revisar o fechamento.",
      );
    }
  }

  function confirmReview() {
    if (!review || closeCash.isPending) return;
    if (uncertainResult && !canRecover) return;
    if (!uncertainResult && (!csrfReady || !allowedToClose || !screenActive))
      return;
    if (!actorMatches) {
      setReviewError(
        uncertainResult
          ? "A conta autenticada mudou. Somente a conta original pode recuperar a tentativa incerta; o UUID e o payload continuam preservados."
          : "A conta ou o nome autenticado mudou depois da revisão. Atualize e faça uma nova revisão com a identidade atual.",
      );
      if (!uncertainResult) setRequiresRefresh(true);
      return;
    }
    if (
      !uncertainResult &&
      (reviewBlocked || reviewIsStale || stateError || !state)
    ) {
      setRequiresRefresh(true);
      setReviewError(
        "A revisão não pode ser enviada porque a abertura, a revisão ou a sessão mudou. Atualize o estado e revise novamente; nenhum payload será atualizado pelo polling.",
      );
      return;
    }
    closeCash.mutate({
      ...review.payload,
      countedByMethod: { ...review.payload.countedByMethod },
    });
  }

  async function refreshAndReviewAgain() {
    if (refreshingReview || closeCash.isPending || uncertainResult) return;
    setRefreshingReview(true);
    try {
      const refreshed = await refreshState();
      if (refreshed.error || !refreshed.data) {
        setReviewError(
          "Não foi possível atualizar o estado. A revisão continua bloqueada e as contagens foram preservadas.",
        );
        return;
      }
      const reviewedOpeningId = review?.payload.openingId ?? null;
      const refreshedOpeningId = refreshed.data.activeOpening?.id ?? null;
      const sameOpening =
        reviewedOpeningId !== null && reviewedOpeningId === refreshedOpeningId;
      setReview(null);
      setFormVisible(sameOpening);
      if (reviewedOpeningId !== null) setFormOpeningId(reviewedOpeningId);
      setReviewError("");
      setRequiresRefresh(false);
      setUncertainResult(false);
      setStatusNotice(
        sameOpening
          ? "Estado do caixa atualizado para a mesma abertura. As contagens foram preservadas; confira uma nova revisão explícita antes de confirmar."
          : `Estado atualizado. As contagens preservadas pertencem à abertura #${reviewedOpeningId}; não foram transferidas. ${refreshedOpeningId === null ? "Não há abertura ativa no momento." : `A abertura atual é #${refreshedOpeningId}.`} Inicie deliberadamente uma nova contagem em branco quando quiser fechar a abertura atual.`,
      );
    } catch {
      setReviewError(
        "A atualização falhou. A revisão continua bloqueada, os valores foram mantidos e nenhum novo envio foi feito.",
      );
    } finally {
      setRefreshingReview(false);
    }
  }

  function leaveReview(cancelled: boolean) {
    if (
      closeCash.isPending ||
      uncertainResult ||
      reviewNeedsRefresh ||
      refreshingReview
    ) {
      return;
    }
    setReview(null);
    setFormVisible(true);
    setReviewError("");
    setStatusNotice(
      cancelled
        ? "O fechamento foi cancelado sem gravar. As contagens digitadas foram mantidas."
        : "Volte ao formulário para ajustar os valores. Nada foi gravado.",
    );
  }

  if (!opening && !showForm && !review) return null;

  return (
    <View style={{ gap: 14 }}>
      {!review && !showForm ? (
        <Card style={{ gap: 15 }}>
          <SectionTitle
            title="Conferência do turno"
            eyebrow="FECHAMENTO MANUAL"
          />
          {stateFetching ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 9 }}
            >
              <ActivityIndicator size="small" color={C.green} />
              <Body size={11}>Atualizando abertura e resumo integral…</Body>
            </View>
          ) : null}
          {stateError ? (
            <Notice warning>
              A consulta atual falhou. Os dados em cache são somente para
              leitura; nenhum fechamento pode ser iniciado com informação
              desatualizada.
            </Notice>
          ) : null}
          {state && !summary ? (
            <Notice warning>
              O servidor não forneceu um resumo completo para esta abertura. Não
              se calcula esperado a partir de uma página do histórico.
            </Notice>
          ) : null}
          {stateError && summary ? (
            <Notice warning>
              O resumo abaixo é a última fotografia recebida e pode estar
              desatualizado. Ele permanece somente para consulta.
            </Notice>
          ) : null}
          {summary ? (
            <>
              {opening ? (
                <DetailRow label="Abertura" value={`#${opening.id}`} />
              ) : null}
              <DetailRow
                label="Dinheiro esperado (fundo incluído)"
                value={formatCents(summary.cashExpected)}
              />
              <DetailRow
                label="Pix bruto esperado"
                value={formatCents(summary.receiptsByMethod.pix)}
              />
              <DetailRow
                label="Débito bruto esperado"
                value={formatCents(summary.receiptsByMethod.debito)}
              />
              <DetailRow
                label="Crédito bruto esperado"
                value={formatCents(summary.receiptsByMethod.credito)}
              />
              <DetailRow
                label="Movimentos no resumo completo"
                value={String(summary.count)}
              />
            </>
          ) : null}
          {statusNotice ? <Notice>{statusNotice}</Notice> : null}
          {formOpeningId !== null && !formBelongsToCurrentOpening ? (
            <Notice warning>
              As contagens preservadas pertencem à abertura #{formOpeningId}.
              {opening
                ? ` A abertura atual é #${opening.id}; nenhuma contagem será transferida. Ao iniciar, os quatro campos serão limpos explicitamente para uma contagem nova.`
                : " Não há abertura ativa neste momento; os campos continuam preservados."}
            </Notice>
          ) : null}
          {allowedToClose ? (
            <Button
              icon="clipboard"
              disabled={
                !opening || !canStartNewForm || Boolean(review) || showForm
              }
              onPress={startForm}
            >
              {formOpeningId !== null && !formBelongsToCurrentOpening
                ? "Iniciar nova contagem em branco"
                : "Conferir e fechar turno"}
            </Button>
          ) : (
            <Notice>
              Seu perfil tem consulta somente leitura. Proprietário, gerente ou
              caixa autenticado podem fechar e conferir sozinhos.
            </Notice>
          )}
          {!csrfReady && allowedToClose ? (
            <Notice warning>
              A proteção CSRF da sessão não está carregada. O fechamento ficará
              desabilitado até o token seguro estar disponível.
            </Notice>
          ) : null}
          {!actorAvailable && allowedToClose ? (
            <Notice warning>
              A sessão não forneceu ID e nome autenticados válidos. Nenhuma
              revisão de fechamento será permitida.
            </Notice>
          ) : null}
          {!snapshotCurrent && !stateError && allowedToClose ? (
            <Notice warning>
              O fechamento exige abertura ativa e resumo integral recentes do
              servidor. Aguarde a atualização ou recarregue antes de revisar.
            </Notice>
          ) : null}
        </Card>
      ) : null}

      {showForm && !review && opening ? (
        <CashClosingForm
          values={values}
          actorId={actorId}
          actorName={actorName}
          error={formError}
          disabled={!canPrepare || closeCash.isPending}
          csrfReady={csrfReady}
          onChange={(next) => {
            setValues(next);
            setFormError("");
          }}
          onReview={prepareReview}
          onCancel={() => {
            if (closeCash.isPending) return;
            setFormVisible(false);
            setFormError("");
            setStatusNotice(
              "Formulário cancelado sem gravar; valores preservados.",
            );
          }}
        />
      ) : null}

      {review ? (
        <CashClosingReviewScreen
          review={review}
          error={reviewError}
          stale={reviewNeedsRefresh}
          uncertain={uncertainResult}
          pending={closeCash.isPending}
          blocked={reviewBlocked}
          refreshing={refreshingReview}
          authorized={allowedToClose && screenActive}
          actorMatches={actorMatches}
          csrfReady={csrfReady}
          onConfirm={confirmReview}
          onBack={leaveReview}
          onRefresh={() => void refreshAndReviewAgain()}
        />
      ) : null}
    </View>
  );
}
