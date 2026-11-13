import React, { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import {
  Body,
  Button,
  C,
  Card,
  F,
  Label,
  Notice,
  SectionTitle,
} from "@/components/sobra/ui";
import { CashMovementsForm } from "@/components/sobra/gestao/cash-movements-form";
import { CashMovementsHistory } from "@/components/sobra/gestao/cash-movements-history";
import { CashMovementsReview } from "@/components/sobra/gestao/cash-movements-review";
import {
  buildCashMovementReview,
  cashMovementReviewMatchesActor,
  changeCashMovementType,
  createCashMovementIntentId,
  emptyCashMovementForm,
  type CashMovementFormValues,
  type CashMovementReview,
} from "@/lib/business/cash-movement-ui";
import type { CashOpening } from "@/lib/business/cash-domain";
import type { CashTurnSnapshot } from "@/lib/business/cash-movement-domain";
import { formatCents } from "@/lib/business/fuel-domain";
import { trpc } from "@/lib/trpc";

type MovementHistoryPage =
  inferRouterOutputs<AppRouter>["cash"]["movementHistory"];

type SnapshotRefresh = () => Promise<{
  data?: CashTurnSnapshot;
  error?: unknown;
}>;

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

function isMovementConflict(error: unknown) {
  const { code, message } = errorDetails(error);
  return (
    code === "CONFLICT" ||
    code === "PRECONDITION_FAILED" ||
    /conflict|revision|revis[aã]o|turno.{0,45}(expir|vigente|encerr|fora)|fora do hor[aá]rio|abertura.{0,35}(ativa|existente)/i.test(
      message,
    )
  );
}

function isDefiniteRejection(error: unknown) {
  const { code } = errorDetails(error);
  return [
    "BAD_REQUEST",
    "FORBIDDEN",
    "UNAUTHORIZED",
    "NOT_FOUND",
    "TOO_MANY_REQUESTS",
  ].includes(code);
}

function timestampLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    return "Horário do servidor indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function summaryMatchesOpening(
  snapshot: CashTurnSnapshot | undefined,
  opening: CashOpening,
) {
  return Boolean(
    snapshot?.activeOpening?.id === opening.id &&
    snapshot.summary &&
    snapshot.summary.openingFloat === opening.openingFloat,
  );
}

function serverWindowMatchesOpening(
  snapshot: CashTurnSnapshot | undefined,
  opening: CashOpening,
) {
  return Boolean(
    snapshot?.scheduledShift &&
    snapshot.operationDate === opening.operationDate &&
    snapshot.scheduledShift.id === opening.shift.id &&
    Number.isFinite(Date.parse(snapshot.serverNow)) &&
    Number.isFinite(Date.parse(opening.openedAt)) &&
    Date.parse(snapshot.serverNow) >= Date.parse(opening.openedAt),
  );
}

export function CashMovementsPanel({
  snapshot,
  snapshotError,
  snapshotFetching,
  opening,
  unitName,
  responsibleId,
  responsibleName,
  allowedToRead,
  allowedToRecord,
  csrfReady,
  screenActive,
  refreshSnapshot,
}: {
  snapshot: CashTurnSnapshot | undefined;
  snapshotError: boolean;
  snapshotFetching: boolean;
  opening: CashOpening;
  unitName: string;
  responsibleId: number;
  responsibleName: string;
  allowedToRead: boolean;
  allowedToRecord: boolean;
  csrfReady: boolean;
  screenActive: boolean;
  refreshSnapshot: SnapshotRefresh;
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState<CashMovementFormValues>(
    emptyCashMovementForm,
  );
  const [formVisible, setFormVisible] = useState(false);
  const [review, setReview] = useState<CashMovementReview | null>(null);
  const [formError, setFormError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [statusNotice, setStatusNotice] = useState("");
  const [lastSuccess, setLastSuccess] = useState<{
    id: number;
    recordedAt: string;
    replayed: boolean;
  } | null>(null);
  const [requiresRefresh, setRequiresRefresh] = useState(false);
  const [uncertainResult, setUncertainResult] = useState(false);
  const [refreshingReview, setRefreshingReview] = useState(false);
  const [cursorState, setCursorState] = useState<{
    openingId: number;
    stack: number[];
  }>({ openingId: opening.id, stack: [] });
  const cursorStack =
    cursorState.openingId === opening.id ? cursorState.stack : [];
  const cursor = cursorStack[cursorStack.length - 1];

  const historyEnabled = Boolean(
    screenActive && allowedToRead && opening.id > 0,
  );
  const historyQuery = trpc.cash.movementHistory.useQuery(
    {
      openingId: opening.id,
      limit: 50,
      ...(cursor === undefined ? {} : { cursor }),
    },
    {
      enabled: historyEnabled,
      retry: false,
      gcTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: screenActive,
      refetchInterval: screenActive ? 15_000 : false,
      refetchIntervalInBackground: false,
    },
  );

  const recordMovement = trpc.cash.recordMovement.useMutation({
    onSuccess: (result) => {
      setLastSuccess({
        id: result.movement.id,
        recordedAt: result.movement.recordedAt,
        replayed: result.replayed,
      });
      setStatusNotice(
        result.replayed
          ? "O servidor confirmou a mesma tentativa anterior sem duplicar o movimento."
          : "O servidor confirmou e registrou a movimentação.",
      );
      setReview(null);
      setForm(emptyCashMovementForm());
      setFormVisible(false);
      setFormError("");
      setReviewError("");
      setRequiresRefresh(false);
      setUncertainResult(false);
      setCursorState({ openingId: opening.id, stack: [] });
      void Promise.all([
        utils.cash.turnSnapshot.invalidate(),
        utils.cash.movementHistory.invalidate(),
        utils.cash.position.invalidate(),
      ]);
    },
    onError: (failure) => {
      const { code, message } = errorDetails(failure);
      setStatusNotice("");
      setReviewError(
        message ||
          "Não foi possível confirmar a movimentação. Os dados do formulário foram mantidos.",
      );
      if (code === "CONFLICT" && /conta autenticada mudou/i.test(message)) {
        // Preserve an earlier uncertain result until the original account can
        // recover it. The rejected retry does not resolve the original attempt.
        setRequiresRefresh(!uncertainResult);
        return;
      }
      if (isMovementConflict(failure)) {
        setRequiresRefresh(true);
        setUncertainResult(false);
        setReviewError(
          message
            ? `${message} Atualize o estado e faça uma nova revisão antes de tentar novamente.`
            : "A revisão mudou ou o turno expirou. Atualize o estado e faça uma nova revisão antes de tentar novamente.",
        );
        return;
      }
      if (isDefiniteRejection(failure)) {
        setUncertainResult(false);
        return;
      }
      // A resposta de transporte pode ter sido perdida depois do commit. A única
      // repetição permitida mantém exatamente a intenção e o payload já revisados.
      setUncertainResult(true);
      setRequiresRefresh(false);
      setReviewError(
        code === "TIMEOUT"
          ? "A chamada expirou sem resposta conclusiva. O servidor pode ter registrado; repita manualmente a mesma intenção para recuperar a confirmação."
          : "Não recebemos uma resposta final do servidor. O resultado pode ser incerto; repita somente esta mesma tentativa para recuperar a confirmação.",
      );
    },
  });

  const currentSummary = summaryMatchesOpening(snapshot, opening)
    ? (snapshot?.summary ?? null)
    : null;
  const summaryIsStale = Boolean(currentSummary && snapshotError);
  const currentTurn = serverWindowMatchesOpening(snapshot, opening);
  const canUseSnapshot = Boolean(
    currentSummary && !snapshotError && !snapshotFetching,
  );
  const canStartMovement = Boolean(
    allowedToRecord &&
    allowedToRead &&
    csrfReady &&
    screenActive &&
    canUseSnapshot &&
    currentTurn &&
    !recordMovement.isPending,
  );

  const reviewActorChanged = Boolean(
    review && review.payload.expectedActorId !== responsibleId,
  );
  const reviewIsStale = Boolean(
    review &&
    (!cashMovementReviewMatchesActor(review, responsibleId, responsibleName) ||
      snapshotError ||
      !snapshot ||
      snapshot.revision !== review.payload.expectedRevision ||
      snapshot.activeOpening?.id !== review.payload.openingId ||
      snapshot.operationDate !== review.payload.operationDate ||
      snapshot.scheduledShift?.id !== review.payload.shiftId),
  );
  const reviewNeedsRefresh = Boolean(
    review && !uncertainResult && (requiresRefresh || reviewIsStale),
  );
  const reviewBlocked = Boolean(
    review &&
    !uncertainResult &&
    (reviewNeedsRefresh ||
      snapshotFetching ||
      snapshotError ||
      !screenActive ||
      !allowedToRecord),
  );

  const rawHistoryPage = historyQuery.data as MovementHistoryPage | undefined;
  const historyPage =
    rawHistoryPage?.openingId === opening.id ? rawHistoryPage : undefined;
  const wrongOpeningPage = Boolean(
    rawHistoryPage && rawHistoryPage.openingId !== opening.id,
  );
  const historyError = wrongOpeningPage
    ? "A página recebida não corresponde à abertura autorizada."
    : (historyQuery.error?.message ?? "");

  function startForm() {
    if (!canStartMovement) return;
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
    if (!canStartMovement || !snapshot) {
      setFormError(
        snapshotError
          ? "A posição mais recente falhou. Atualize o estado antes de iniciar uma revisão."
          : "Aguarde uma posição atual, resumo completo, turno vigente e proteção CSRF antes de revisar.",
      );
      return;
    }
    try {
      const nextReview = buildCashMovementReview({
        form,
        snapshot,
        intentId: createCashMovementIntentId(),
        unitName,
        responsibleId,
        responsibleName,
      });
      setReview(nextReview);
      setFormVisible(false);
      setRequiresRefresh(false);
      setUncertainResult(false);
    } catch (failure) {
      setFormError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível revisar a movimentação.",
      );
    }
  }

  function confirmReview() {
    if (
      !review ||
      recordMovement.isPending ||
      !csrfReady ||
      !allowedToRead ||
      !allowedToRecord
    ) {
      return;
    }
    if (reviewActorChanged) {
      setReviewError(
        "A conta mudou após a conferência. Uma tentativa incerta só pode ser recuperada pela conta original; sem envio anterior, atualize e faça uma nova revisão.",
      );
      return;
    }
    if (
      !uncertainResult &&
      (reviewBlocked || reviewIsStale || snapshotError || !snapshot)
    ) {
      setRequiresRefresh(true);
      setReviewError(
        "O estado do servidor mudou ou não está disponível. Atualize e faça uma nova revisão; nenhum payload será atualizado automaticamente.",
      );
      return;
    }
    recordMovement.mutate({ ...review.payload });
  }

  async function refreshAndReviewAgain() {
    if (refreshingReview || recordMovement.isPending || uncertainResult) return;
    setRefreshingReview(true);
    try {
      const refreshed = await refreshSnapshot();
      if (refreshed.error || !refreshed.data) {
        setReviewError(
          "Não foi possível atualizar a posição. A revisão continua bloqueada e o formulário foi preservado.",
        );
        return;
      }
      setReview(null);
      setFormVisible(true);
      setReviewError("");
      setRequiresRefresh(false);
      setUncertainResult(false);
      setStatusNotice(
        "Estado atualizado pelo servidor. Os campos foram preservados; faça uma nova revisão explícita antes de confirmar.",
      );
    } catch {
      setReviewError(
        "A atualização falhou. A revisão continua bloqueada e nenhum novo envio foi feito.",
      );
    } finally {
      setRefreshingReview(false);
    }
  }

  function leaveReview(cancelled: boolean) {
    if (
      recordMovement.isPending ||
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
        ? "A revisão foi cancelada sem gravar. O formulário foi preservado."
        : "Volte ao formulário para ajustar os dados. Nada foi gravado.",
    );
  }

  function updateForm(patch: Partial<CashMovementFormValues>) {
    setForm((previous) => ({ ...previous, ...patch }));
    setFormError("");
  }

  function openOlderPage() {
    const nextCursor = historyPage?.nextCursor;
    if (nextCursor === null || nextCursor === undefined) return;
    setCursorState({
      openingId: opening.id,
      stack: [...cursorStack, nextCursor],
    });
  }

  function openNewerPage() {
    setCursorState({
      openingId: opening.id,
      stack: cursorStack.slice(0, -1),
    });
  }

  return (
    <View style={{ gap: 18 }}>
      <Card style={{ gap: 16 }}>
        <SectionTitle title="Movimentos do turno" eyebrow="CAIXA PRINCIPAL" />
        <Body>
          Resumo compartilhado pelo servidor e histórico imutável da abertura #
          {opening.id}. Fundo, suprimentos e sangrias são custódia; o resumo não
          é lucro, saldo bancário nem dinheiro contado.
        </Body>

        {snapshotFetching ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
            <ActivityIndicator size="small" color={C.green} />
            <Body size={11}>Atualizando posição e resumo do servidor…</Body>
          </View>
        ) : null}
        {snapshotError ? (
          <Notice warning>
            A consulta do resumo mais recente falhou. Nenhuma nova movimentação
            pode ser iniciada com dados em cache. Um resumo anterior, se
            exibido, está marcado como desatualizado.
          </Notice>
        ) : null}
        {!snapshot && !snapshotFetching && snapshotError ? (
          <Notice warning>
            Nenhum resumo foi recebido. Não há estado vazio ou totais fictícios.
            Atualize quando a conexão estiver disponível.
          </Notice>
        ) : null}
        {snapshot && !currentSummary ? (
          <Notice warning>
            O servidor não forneceu um resumo completo associado a esta
            abertura. Nenhum total foi calculado a partir da página de
            histórico.
          </Notice>
        ) : null}
        {summaryIsStale ? (
          <Notice warning>
            Os valores abaixo são a última fotografia recebida e podem estar
            desatualizados. Eles ficam somente para consulta até uma resposta
            atual do servidor.
          </Notice>
        ) : null}

        {currentSummary ? (
          <>
            <View
              style={{
                padding: 18,
                borderRadius: 16,
                backgroundColor: C.green,
                gap: 7,
              }}
            >
              <Label color={C.lime}>DINHEIRO ESPERADO NA GAVETA</Label>
              <Text
                style={{ color: C.white, fontFamily: F.extra, fontSize: 30 }}
              >
                {formatCents(currentSummary.cashExpected)}
              </Text>
              <Body color="#D0DDCE" size={11}>
                Fundo {formatCents(currentSummary.openingFloat)} + recebimentos
                em dinheiro + suprimentos − sangrias. Não é contagem física.
              </Body>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
              {(
                [
                  ["Dinheiro", currentSummary.receiptsByMethod.dinheiro],
                  ["Pix", currentSummary.receiptsByMethod.pix],
                  ["Débito", currentSummary.receiptsByMethod.debito],
                  ["Crédito", currentSummary.receiptsByMethod.credito],
                ] as const
              ).map(([label, amount]) => (
                <View
                  key={label}
                  style={{
                    flexGrow: 1,
                    flexBasis: 125,
                    padding: 13,
                    borderRadius: 12,
                    backgroundColor: C.light,
                    gap: 5,
                  }}
                >
                  <Label>{label.toUpperCase()}</Label>
                  <Text
                    style={{ color: C.ink, fontFamily: F.bold, fontSize: 15 }}
                  >
                    {formatCents(amount)}
                  </Text>
                </View>
              ))}
            </View>

            <View style={{ gap: 10 }}>
              <SummaryRow
                label="Vendas registradas"
                value={currentSummary.sales}
              />
              <SummaryRow
                label="Contas anteriores recebidas"
                value={currentSummary.previousReceipts}
              />
              <SummaryRow label="Suprimentos" value={currentSummary.supplies} />
              <SummaryRow label="Sangrias" value={currentSummary.withdrawals} />
              <SummaryRow
                label="Movimentações no resumo completo"
                value={currentSummary.count}
                count
              />
            </View>
          </>
        ) : null}

        {snapshot && !snapshotError && !currentTurn ? (
          <Notice warning>
            O horário previsto deste turno terminou ou mudou. O histórico e o
            resumo continuam somente para consulta; novas movimentações estão
            bloqueadas pelo horário do servidor.
          </Notice>
        ) : null}
        {statusNotice ? <Notice>{statusNotice}</Notice> : null}
        {lastSuccess ? (
          <Notice>
            Último registro confirmado pelo servidor: movimento #
            {lastSuccess.id}
            {lastSuccess.replayed
              ? " · confirmação recuperada por repetição idempotente"
              : ""}
            {` · ${timestampLabel(lastSuccess.recordedAt)}`}
          </Notice>
        ) : null}

        {allowedToRead && !allowedToRecord ? (
          <Notice>
            Seu perfil tem consulta somente leitura. Proprietário, gerente e
            caixa/conveniência podem registrar movimentos.
          </Notice>
        ) : null}
        {allowedToRecord ? (
          <Button
            icon="plus"
            disabled={!canStartMovement || Boolean(review) || formVisible}
            onPress={startForm}
          >
            Registrar movimentação
          </Button>
        ) : null}
        {!csrfReady && allowedToRecord ? (
          <Notice warning>
            A proteção CSRF não está carregada. Registrar movimentos fica
            desabilitado até a sessão fornecer o token.
          </Notice>
        ) : null}
      </Card>

      {formVisible && !review ? (
        <CashMovementsForm
          values={form}
          responsibleId={responsibleId}
          responsibleName={responsibleName}
          error={formError}
          disabled={!canStartMovement || recordMovement.isPending}
          csrfReady={csrfReady}
          onChange={updateForm}
          onTypeChange={(type) => {
            setForm((previous) => changeCashMovementType(previous, type));
            setFormError("");
          }}
          onPrepare={prepareReview}
          onCancel={() => {
            if (recordMovement.isPending) return;
            setFormVisible(false);
            setFormError("");
            setStatusNotice("Formulário cancelado sem gravar.");
          }}
        />
      ) : null}

      {review ? (
        <View style={{ gap: 12 }}>
          {reviewActorChanged ? (
            <Notice warning>
              A conta autenticada mudou depois da conferência. A confirmação
              está bloqueada. Se o resultado anterior é incerto, retorne à conta
              original para recuperar a mesma intenção; caso contrário, atualize
              e faça uma nova revisão com o responsável atual.
            </Notice>
          ) : null}
          <CashMovementsReview
            review={review}
            error={reviewError}
            stale={reviewNeedsRefresh}
            uncertain={uncertainResult}
            pending={recordMovement.isPending}
            blocked={reviewBlocked}
            refreshing={refreshingReview}
            authorized={allowedToRead && allowedToRecord && !reviewActorChanged}
            csrfReady={csrfReady}
            onConfirm={confirmReview}
            onBack={leaveReview}
            onRefresh={() => void refreshAndReviewAgain()}
          />
        </View>
      ) : null}

      <CashMovementsHistory
        page={historyPage}
        loading={historyQuery.isLoading}
        refreshing={historyQuery.isFetching}
        error={historyError}
        pageNumber={cursorStack.length + 1}
        hasNewer={cursorStack.length > 0}
        hasOlder={Boolean(
          historyPage?.nextCursor !== null &&
          historyPage?.nextCursor !== undefined,
        )}
        canNavigate={historyEnabled && !wrongOpeningPage}
        onRefresh={() => void historyQuery.refetch()}
        onNewer={openNewerPage}
        onOlder={openOlderPage}
      />
    </View>
  );
}

function SummaryRow({
  label,
  value,
  count = false,
}: {
  label: string;
  value: number;
  count?: boolean;
}) {
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
      <Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 12 }}>
        {count ? String(value) : formatCents(value)}
      </Text>
    </View>
  );
}
