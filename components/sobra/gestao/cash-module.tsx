import React, { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import type {
  CashOpenInput,
  CashOpening,
  CashOpenResult,
} from "@/lib/business/cash-domain";
import {
  canOpenCash,
  canReadCash,
} from "@/lib/business/cash-domain";
import {
  Body,
  Button,
  C,
  Card,
  Empty,
  Field,
  F,
  Notice,
  SectionTitle,
} from "@/components/sobra/ui";
import {
  GestaoShell,
  useBusinessCsrf,
  useMe,
} from "@/components/sobra/gestao/gestao-shell";
import { STATION_CALENDAR_META } from "@/lib/station-calendar";
import { formatCents, moneyToCents } from "@/lib/business/fuel-domain";
import { trpc } from "@/lib/trpc";

type OpeningReview = {
  payload: CashOpenInput;
  unitName: string;
  registerName: string;
  operatorId: number;
  operatorName: string;
  shiftLabel: string;
  shiftStart: string;
  shiftEnd: string;
  openingFloat: number;
};

function createIntentId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    return (token === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function formatServerDateTime(value: string | Date | null | undefined) {
  if (value === null || value === undefined) return "Horário indisponível";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Horário indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: STATION_CALENDAR_META.timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatOperationDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    dateStyle: "long",
  }).format(date);
}

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

function isRevisionOrShiftConflict(error: unknown) {
  const { code, message } = errorDetails(error);
  return (
    code === "CONFLICT" ||
    code === "PRECONDITION_FAILED" ||
    /conflict|revision|revis[aã]o|turno.{0,45}(expir|vigente|encerr|fora)|fora do hor[aá]rio|abertura.{0,35}(ativa|existente)|caixa.{0,35}(ativo|aberto)/i.test(
      message,
    )
  );
}

function isDefiniteRequestRejection(error: unknown) {
  const { code } = errorDetails(error);
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
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        borderTopWidth: 1,
        borderColor: C.line,
        paddingTop: 13,
      }}
    >
      <Text style={{ color: C.muted, fontFamily: F.medium, fontSize: 12 }}>
        {label}
      </Text>
      <Text
        selectable
        style={{
          flex: 1,
          color: C.ink,
          fontFamily: F.bold,
          fontSize: 13,
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function OpeningCard({
  opening,
  unitName,
}: {
  opening: CashOpening;
  unitName: string;
}) {
  return (
    <Card style={{ gap: 16 }}>
      <SectionTitle title="Caixa principal aberto" eyebrow="ABERTURA CENTRAL" />
      <Notice>
        Este turno permanece aberto depois do horário previsto. Ele não se encerra
        automaticamente e bloqueia uma nova abertura até o fechamento, que será
        tratado em uma etapa posterior.
      </Notice>
      <DetailRow label="Identificador da abertura" value={String(opening.id)} />
      <DetailRow label="Unidade" value={unitName} />
      <DetailRow label="Operador da sessão" value={`${opening.operator} · ID ${opening.operatorId}`} />
      <DetailRow
        label="Data operacional e turno"
        value={`${formatOperationDate(opening.operationDate)} · ${opening.shift.label} (${opening.shift.start}–${opening.shift.end})`}
      />
      <DetailRow label="Aberto pelo servidor" value={formatServerDateTime(opening.openedAt)} />
      <DetailRow
        label="Fundo inicial"
        value={`${formatCents(opening.openingFloat)} · valor de custódia, não receita`}
      />
      <Notice warning>
        Esta primeira entrega não oferece movimentos nem fechamento. Não use o
        valor do fundo como receita ou como valor contado posteriormente.
      </Notice>
    </Card>
  );
}

export function CashManagementScreen() {
  const session = useMe();
  const role = session.data?.role ?? "";
  const allowedToRead = canReadCash(role);
  const allowedToOpen = canOpenCash(role);
  const csrf = useBusinessCsrf(Boolean(session.data && allowedToOpen));
  const [openingFloatText, setOpeningFloatText] = useState("");
  const [review, setReview] = useState<OpeningReview | null>(null);
  const [formError, setFormError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [statusNotice, setStatusNotice] = useState("");
  const [requiresRefresh, setRequiresRefresh] = useState(false);
  const [uncertainResult, setUncertainResult] = useState(false);
  const [refreshingReview, setRefreshingReview] = useState(false);
  const [confirmedOpening, setConfirmedOpening] =
    useState<CashOpenResult | null>(null);

  const position = trpc.cash.position.useQuery(undefined, {
    enabled: Boolean(session.data && allowedToRead),
    retry: false,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  const openCash = trpc.cash.open.useMutation({
    onSuccess: (result) => {
      setConfirmedOpening(result);
      setReview(null);
      setReviewError("");
      setRequiresRefresh(false);
      setUncertainResult(false);
      setStatusNotice(
        result.replayed
          ? "A abertura foi confirmada pelo servidor ao recuperar a mesma intenção."
          : "Abertura confirmada pelo servidor.",
      );
      void position.refetch();
    },
    onError: (failure) => {
      const { code, message } = errorDetails(failure);
      setReviewError(
        message ||
          "Não foi possível concluir a abertura. Os dados da revisão foram mantidos.",
      );
      setStatusNotice("");

      if (isRevisionOrShiftConflict(failure)) {
        setRequiresRefresh(true);
        setUncertainResult(false);
        setReviewError(
          message
            ? `${message} Atualize o estado e faça uma nova revisão antes de tentar outra abertura.`
            : "A revisão ficou desatualizada ou o turno expirou. Atualize o estado e faça uma nova revisão antes de tentar outra abertura.",
        );
        return;
      }

      if (isDefiniteRequestRejection(failure)) {
        setUncertainResult(false);
        return;
      }

      // A falha de transporte ou erro inesperado pode ocultar uma resposta já
      // confirmada. Só se permite repetir o mesmo payload e o mesmo intentId.
      setUncertainResult(true);
      setReviewError(
        "Não recebemos uma resposta final do servidor. O resultado pode ser incerto; repita somente esta mesma tentativa para recuperar a confirmação, sem trocar o identificador de intenção.",
      );
      if (code === "TIMEOUT") setRequiresRefresh(false);
    },
  });

  const positionData = position.data;
  const activeOpening =
    positionData?.activeOpening ?? confirmedOpening?.opening ?? null;
  const csrfReady = Boolean(csrf.data?.token);
  const sessionName = session.data?.name?.trim() || "Nome não informado na sessão";
  const unitName =
    session.data?.location?.name ||
    session.data?.organization?.name ||
    "Unidade vinculada à sessão";

  const reviewIsStale = Boolean(
    review &&
      positionData &&
      (positionData.revision !== review.payload.expectedRevision ||
        positionData.operationDate !== review.payload.operationDate ||
        positionData.scheduledShift?.id !== review.payload.shiftId ||
        positionData.activeOpening !== null),
  );
  const reviewNeedsRefresh = Boolean(
    review &&
      !uncertainResult &&
      (requiresRefresh || reviewIsStale || Boolean(position.error)),
  );
  const reviewBlocked = Boolean(
    review &&
      !uncertainResult &&
      (reviewNeedsRefresh || position.isFetching),
  );

  function createReview() {
    setFormError("");
    setReviewError("");
    setStatusNotice("");

    if (position.isFetching || position.error) {
      setFormError("Atualize a posição do caixa antes de iniciar uma revisão.");
      return;
    }
    if (!positionData) {
      setFormError("Atualize a posição do caixa antes de iniciar uma revisão.");
      return;
    }
    if (positionData.activeOpening) {
      setFormError("Já existe uma abertura ativa para o caixa principal.");
      return;
    }
    if (!positionData.scheduledShift) {
      setFormError("O servidor informa que não há turno previsto para abertura agora.");
      return;
    }
    if (!session.data || !allowedToOpen) {
      setFormError("Seu perfil permite consultar, mas não abrir o caixa.");
      return;
    }
    if (!openingFloatText.trim()) {
      setFormError("Informe o fundo contado. Use zero explicitamente se não houver valor inicial.");
      return;
    }

    try {
      const openingFloat = moneyToCents(openingFloatText, true);
      if (!Number.isSafeInteger(openingFloat) || openingFloat < 0) {
        throw new Error("O fundo deve ser um valor não negativo em centavos seguros.");
      }
      const payload: CashOpenInput = {
        intentId: createIntentId(),
        expectedRevision: positionData.revision,
        operationDate: positionData.operationDate,
        shiftId: positionData.scheduledShift.id,
        openingFloat,
      };
      setReview({
        payload,
        unitName,
        registerName: "Caixa principal",
        operatorId: session.data.id,
        operatorName: sessionName,
        shiftLabel: positionData.scheduledShift.label,
        shiftStart: positionData.scheduledShift.start,
        shiftEnd: positionData.scheduledShift.end,
        openingFloat,
      });
      setRequiresRefresh(false);
      setUncertainResult(false);
    } catch (failure) {
      setFormError(
        failure instanceof Error
          ? failure.message
          : "Informe um valor monetário válido com até duas casas decimais.",
      );
    }
  }

  function confirmOpening() {
    if (!review || openCash.isPending || !csrfReady) return;
    if (!uncertainResult && (reviewBlocked || reviewIsStale || position.error)) {
      setRequiresRefresh(true);
      setReviewError(
        "A revisão não pode ser enviada porque a posição pode ter mudado. Atualize o estado e faça uma nova revisão.",
      );
      return;
    }
    openCash.mutate(review.payload);
  }

  async function refreshAndReopenReview() {
    if (refreshingReview || openCash.isPending || uncertainResult) return;
    setRefreshingReview(true);
    try {
      const refreshed = await position.refetch();
      if (refreshed.error || !refreshed.data) {
        setReviewError(
          "Não foi possível atualizar a posição. A revisão continua bloqueada; tente atualizar novamente quando houver conexão.",
        );
        return;
      }
      setReview(null);
      setReviewError("");
      setRequiresRefresh(false);
      setUncertainResult(false);
      setStatusNotice(
        "Estado do caixa atualizado. Os campos foram mantidos; confira uma nova revisão antes de confirmar.",
      );
    } catch {
      setReviewError(
        "A atualização falhou. A revisão continua bloqueada, os campos foram mantidos e nenhuma nova tentativa foi enviada.",
      );
    } finally {
      setRefreshingReview(false);
    }
  }

  function leaveReview(cancelled: boolean) {
    if (openCash.isPending || uncertainResult || requiresRefresh) return;
    setReview(null);
    setReviewError("");
    setStatusNotice(
      cancelled
        ? "A conferência foi cancelada sem gravar. O valor digitado foi mantido."
        : "Volte ao formulário para ajustar os dados. Nada foi gravado.",
    );
  }

  if (session.data && !allowedToRead) {
    return (
      <GestaoShell
        title="Caixa"
        subtitle="Consulta protegida do caixa principal desta unidade."
      >
        <Notice warning>
          Seu perfil não tem acesso ao caixa multiusuário. O caixa está disponível
          somente para proprietário, gerente, caixa e consulta financeira.
        </Notice>
      </GestaoShell>
    );
  }

  const serverTime = positionData?.serverNow
    ? formatServerDateTime(positionData.serverNow)
    : "Aguardando resposta do servidor";

  return (
    <GestaoShell
      title="Caixa"
      subtitle="Abertura autenticada do caixa principal da unidade."
    >
      <Notice>
        A posição e o horário vêm do servidor. A consulta depende de conexão com a
        internet; a atualização periódica não sincroniza o caixa quando o aparelho
        fica offline.
        Ao entrar ou sair da conta em outra aba, esta página recarrega por segurança
        e descarta rascunhos ainda não enviados.
      </Notice>

      {position.isLoading && !positionData ? (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <ActivityIndicator color={C.green} />
          <Body>Consultando o estado central do caixa…</Body>
        </Card>
      ) : null}

      {position.error ? (
        <Notice warning>
          Não foi possível consultar a posição mais recente. Verifique a conexão e
          atualize; uma falha de consulta não significa que uma abertura tenha sido
          confirmada.
        </Notice>
      ) : null}

      {!positionData && !position.isLoading ? (
        <Card style={{ gap: 14 }}>
          <SectionTitle title="Estado indisponível" eyebrow="CAIXA CENTRAL" />
          <Body>
            Nenhuma posição atual foi recebida. Não há dados de demonstração e esta
            tela não presume que o caixa esteja aberto ou fechado.
          </Body>
          <Button
            variant="secondary"
            icon="refresh-cw"
            disabled={position.isFetching || !allowedToRead}
            onPress={() => void position.refetch()}
          >
            Atualizar estado do caixa
          </Button>
        </Card>
      ) : null}

      {positionData ? (
        <Card style={{ gap: 16 }}>
          <SectionTitle title="Caixa principal" eyebrow="ESTADO COMPARTILHADO" />
          <DetailRow label="Unidade" value={unitName} />
          <DetailRow
            label="Horário do servidor · Bauru (America/Sao_Paulo)"
            value={serverTime}
          />
          <DetailRow
            label="Data operacional"
            value={formatOperationDate(positionData.operationDate)}
          />
          <DetailRow
            label="Turno previsto"
            value={
              positionData.scheduledShift
                ? `${positionData.scheduledShift.label} · ${positionData.scheduledShift.start}–${positionData.scheduledShift.end}`
                : "Fora da janela de abertura"
            }
          />
          {position.isFetching ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
              <ActivityIndicator size="small" color={C.green} />
              <Body size={11}>Atualizando a posição do servidor…</Body>
            </View>
          ) : null}
          <Button
            variant="secondary"
            icon="refresh-cw"
            disabled={position.isFetching || !allowedToRead}
            onPress={() => void position.refetch()}
          >
            Atualizar estado do caixa
          </Button>
        </Card>
      ) : null}

      {statusNotice ? <Notice>{statusNotice}</Notice> : null}

      {activeOpening && !review ? (
        <OpeningCard opening={activeOpening} unitName={unitName} />
      ) : null}

      {positionData && !activeOpening && !review ? (
        <>
          <Card style={{ gap: 16 }}>
            <SectionTitle title="Nenhuma abertura ativa" eyebrow="CAIXA PRINCIPAL" />
            {positionData.scheduledShift ? (
              <Body>
                A posição atual não contém uma abertura ativa. Confira o fundo
                contado e a escala do servidor antes de iniciar a revisão.
              </Body>
            ) : (
              <Notice warning>
                O servidor informa que estamos fora da janela de abertura. O
                horário do aparelho não é usado para autorizar um turno.
              </Notice>
            )}
            {allowedToRead && !allowedToOpen ? (
              <Notice>
                Seu perfil tem acesso somente para leitura. Proprietário, gerente ou
                caixa podem iniciar uma abertura dentro do turno vigente.
              </Notice>
            ) : null}
          </Card>

          {allowedToOpen ? (
            <Card style={{ gap: 16 }}>
              <SectionTitle title="Fundo contado" eyebrow="NOVA ABERTURA" />
              <Body>
                Digite o valor contado em dinheiro. O campo começa em branco; informe
                zero de forma explícita quando o fundo for zero. O valor é um saldo
                de custódia, não uma receita.
              </Body>
              <Field
                label="Fundo inicial em dinheiro"
                value={openingFloatText}
                onChangeText={(value) => {
                  setOpeningFloatText(value);
                  setFormError("");
                  setStatusNotice("");
                }}
                placeholder="0,00"
                keyboardType="decimal-pad"
                autoCapitalize="none"
                accessibilityLabel="Fundo inicial em dinheiro"
                style={{
                  minHeight: 62,
                  fontFamily: F.heading,
                  fontSize: 25,
                  textAlign: "center",
                  color: C.ink,
                  backgroundColor: C.white,
                }}
              />
              {formError ? <Notice warning>{formError}</Notice> : null}
              {!csrfReady && allowedToOpen ? (
                <Notice warning>
                  A proteção CSRF da sessão não está disponível. A abertura ficará
                  desabilitada até o token seguro ser carregado.
                </Notice>
              ) : null}
              {csrf.error && allowedToOpen ? (
                <Notice warning>
                  Não foi possível obter a proteção CSRF. Atualize a sessão e tente
                  novamente; nenhuma abertura foi enviada.
                </Notice>
              ) : null}
              <Button
                disabled={
                  !allowedToOpen ||
                  !csrfReady ||
                  !positionData.scheduledShift ||
                  Boolean(positionData.activeOpening) ||
                  position.isFetching ||
                  Boolean(position.error) ||
                  openCash.isPending
                }
                onPress={createReview}
              >
                Revisar abertura
              </Button>
            </Card>
          ) : null}
        </>
      ) : null}

      {review ? (
        <Card style={{ gap: 17 }}>
          <SectionTitle title="Revisão da abertura" eyebrow="CONFIRMAÇÃO EXPLÍCITA" />
          <Body>
            Confira os dados que serão enviados. Voltar ou cancelar não grava nada.
            Somente “Confirmar e abrir caixa” envia a mutação ao servidor.
          </Body>
          <Notice warning>
            Atenção: esta subentrega ainda não oferece movimentações nem
            fechamento centralizados. Uma abertura real permanecerá ativa e
            bloqueará novas aberturas até a entrega do fechamento. Não inicie a
            rotina diária de caixa nesta versão parcial.
          </Notice>
          <DetailRow label="Unidade" value={review.unitName} />
          <DetailRow label="Caixa" value={review.registerName} />
          <DetailRow
            label="Operador autenticado"
            value={`${review.operatorName} · ID ${review.operatorId}`}
          />
          <DetailRow
            label="Data operacional"
            value={formatOperationDate(review.payload.operationDate)}
          />
          <DetailRow
            label="Turno"
            value={`${review.shiftLabel} · ${review.shiftStart}–${review.shiftEnd}`}
          />
          <DetailRow
            label="Fundo inicial"
            value={`${formatCents(review.openingFloat)} · custódia, não receita`}
          />
          <DetailRow
            label="Revisão esperada"
            value={String(review.payload.expectedRevision)}
          />

          {reviewError ? <Notice warning>{reviewError}</Notice> : null}
          {uncertainResult ? (
            <Notice warning>
              A revisão e o identificador de intenção foram preservados. Não altere
              os dados nem inicie outra revisão; uma repetição manual envia
              exatamente o mesmo payload para recuperação idempotente.
            </Notice>
          ) : null}
          {reviewNeedsRefresh ? (
            <Notice warning>
              Esta revisão não pode ser confirmada porque o estado mudou, a leitura
              ficou desatualizada ou o turno pode ter expirado. Atualize o estado e
              faça uma nova revisão; a revisão anterior não será reaproveitada.
            </Notice>
          ) : null}
          {position.isFetching && !uncertainResult ? (
            <Notice>
              Aguarde a consulta em andamento. A revisão permanece fixa enquanto os
              dados novos são recebidos.
            </Notice>
          ) : null}

          {reviewNeedsRefresh ? (
            <Button
              variant="secondary"
              icon="refresh-cw"
              disabled={refreshingReview || openCash.isPending}
              onPress={() => void refreshAndReopenReview()}
            >
              {refreshingReview
                ? "Atualizando estado…"
                : "Atualizar estado e revisar novamente"}
            </Button>
          ) : null}

          {!uncertainResult ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
              <View style={{ flexGrow: 1, flexBasis: 190 }}>
                <Button
                  variant="secondary"
                  disabled={
                    openCash.isPending || requiresRefresh || refreshingReview
                  }
                  onPress={() => leaveReview(false)}
                >
                  Voltar e ajustar
                </Button>
              </View>
              <View style={{ flexGrow: 1, flexBasis: 190 }}>
                <Button
                  variant="ghost"
                  disabled={
                    openCash.isPending || requiresRefresh || refreshingReview
                  }
                  onPress={() => leaveReview(true)}
                >
                  Cancelar abertura
                </Button>
              </View>
            </View>
          ) : null}

          <Button
            disabled={
              !csrfReady ||
              openCash.isPending ||
              refreshingReview ||
              (reviewBlocked && !uncertainResult)
            }
            onPress={confirmOpening}
          >
            {openCash.isPending
              ? "Aguardando confirmação do servidor…"
              : uncertainResult
                ? "Repetir a mesma tentativa"
                : "Confirmar e abrir caixa"}
          </Button>
          {!csrfReady ? (
            <Notice warning>
              A confirmação está desabilitada enquanto a proteção CSRF não estiver
              disponível.
            </Notice>
          ) : null}
        </Card>
      ) : null}

      {!positionData && !position.isLoading && position.error ? (
        <Empty
          title="Posição do caixa indisponível"
          text="A consulta falhou. Atualize quando a conexão estiver disponível; nenhum estado vazio fictício foi exibido como resultado real."
          icon="wifi-off"
        />
      ) : null}
    </GestaoShell>
  );
}
