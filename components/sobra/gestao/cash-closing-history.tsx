import React, { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import type { CashClosing } from "@/lib/business/cash-closing-domain";
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
import { formatCents } from "@/lib/business/fuel-domain";
import { STATION_CALENDAR_META } from "@/lib/station-calendar";
import { trpc } from "@/lib/trpc";

type ClosingHistoryPage =
  inferRouterOutputs<AppRouter>["cash"]["closingHistory"];
type MovementHistoryPage =
  inferRouterOutputs<AppRouter>["cash"]["movementHistory"];
type CashMovement = MovementHistoryPage["items"][number];

function timestampLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Horário indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: STATION_CALENDAR_META.timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function operationDateLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    dateStyle: "long",
  }).format(date);
}

function signedCents(value: number) {
  if (value > 0) return `+${formatCents(value)}`;
  if (value < 0) return `−${formatCents(Math.abs(value))}`;
  return formatCents(0);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
        borderTopWidth: 1,
        borderColor: C.line,
        paddingTop: 10,
      }}
    >
      <Body size={11}>{label}</Body>
      <Text
        selectable
        style={{
          flex: 1,
          color: C.ink,
          fontFamily: F.bold,
          fontSize: 11,
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function CashClosingHistory({
  latestClosing,
  confirmedReceipt,
  latestConfirmed = false,
  snapshotError = false,
  unitName,
  allowedToRead,
  screenActive,
}: {
  latestClosing: CashClosing | null;
  confirmedReceipt: CashClosing | null;
  latestConfirmed?: boolean;
  snapshotError?: boolean;
  unitName: string;
  allowedToRead: boolean;
  screenActive: boolean;
}) {
  const [cursorState, setCursorState] = useState<number[]>([]);
  const cursor = cursorState[cursorState.length - 1];
  const historyEnabled = Boolean(screenActive && allowedToRead);
  const historyQuery = trpc.cash.closingHistory.useQuery(
    { limit: 20, ...(cursor === undefined ? {} : { cursor }) },
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
  const rawPage = historyQuery.data as ClosingHistoryPage | undefined;
  const selectedPage =
    rawPage && Array.isArray(rawPage.items) ? rawPage : undefined;
  const [selectedClosing, setSelectedClosing] = useState<CashClosing | null>(
    null,
  );
  const [ledgerRequested, setLedgerRequested] = useState(false);
  const errorText = historyQuery.error?.message ?? "";

  function toggleClosing(closing: CashClosing) {
    if (selectedClosing?.id === closing.id) {
      setSelectedClosing(null);
      setLedgerRequested(false);
      return;
    }
    setSelectedClosing(closing);
    setLedgerRequested(false);
  }

  function openOlderPage() {
    const nextCursor = selectedPage?.nextCursor;
    if (nextCursor === null || nextCursor === undefined) return;
    setCursorState((previous) => [...previous, nextCursor]);
  }

  function openNewerPage() {
    setCursorState((previous) => previous.slice(0, -1));
  }

  const latestSelected = Boolean(
    latestClosing && selectedClosing?.id === latestClosing.id,
  );
  const confirmedSelected = Boolean(
    confirmedReceipt && selectedClosing?.id === confirmedReceipt.id,
  );

  return (
    <View style={{ gap: 14 }}>
      {latestClosing ? (
        <Card style={{ gap: 13 }}>
          <SectionTitle
            title="Último fechamento"
            eyebrow="COMPROVANTE DO SERVIDOR"
          />
          {snapshotError && !latestConfirmed ? (
            <Notice warning>
              A atualização da fotografia falhou. O registro exibido é a última
              leitura recebida e está somente para consulta.
            </Notice>
          ) : null}
          <ClosingSummary closing={latestClosing} unitName={unitName} />
          <Button
            compact
            variant="secondary"
            onPress={() => toggleClosing(latestClosing)}
          >
            {latestSelected
              ? "Ocultar detalhes"
              : "Ver detalhes e ledger desta abertura"}
          </Button>
          {latestSelected &&
          !selectedPage?.items.some(
            (closing) => closing.id === latestClosing.id,
          ) ? (
            <ClosingDetails
              closing={latestClosing}
              unitName={unitName}
              screenActive={screenActive}
              allowedToRead={allowedToRead}
              ledgerRequested={ledgerRequested}
              onConsultLedger={() => setLedgerRequested(true)}
            />
          ) : null}
        </Card>
      ) : null}

      {confirmedReceipt && confirmedReceipt.id !== latestClosing?.id ? (
        <Card style={{ gap: 13 }}>
          <SectionTitle
            title="Fechamento confirmado nesta sessão"
            eyebrow="COMPROVANTE DO SERVIDOR"
          />
          <ClosingSummary closing={confirmedReceipt} unitName={unitName} />
          <Button
            compact
            variant="secondary"
            onPress={() => toggleClosing(confirmedReceipt)}
          >
            {confirmedSelected
              ? "Ocultar detalhes"
              : "Ver comprovante e ledger desta abertura"}
          </Button>
          {confirmedSelected &&
          !selectedPage?.items.some(
            (closing) => closing.id === confirmedReceipt.id,
          ) ? (
            <ClosingDetails
              closing={confirmedReceipt}
              unitName={unitName}
              screenActive={screenActive}
              allowedToRead={allowedToRead}
              ledgerRequested={ledgerRequested}
              onConsultLedger={() => setLedgerRequested(true)}
            />
          ) : null}
        </Card>
      ) : null}

      <Card style={{ gap: 14 }}>
        <SectionTitle
          title="Histórico de fechamentos"
          eyebrow="CONSULTA SOMENTE LEITURA"
        />
        <Body>
          Registros imutáveis em ordem decrescente de ID, 20 por página. A
          quantidade total e o cursor vêm do servidor; consultar uma abertura
          não recalcula nem soma movimentos na tela.
        </Body>
        {historyQuery.isLoading && !selectedPage ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator color={C.green} />
            <Body>Consultando histórico no servidor…</Body>
          </View>
        ) : null}
        {historyQuery.isFetching && selectedPage ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ActivityIndicator size="small" color={C.green} />
            <Body size={11}>Atualizando a página do histórico…</Body>
          </View>
        ) : null}
        {errorText ? (
          <Notice warning>
            Não foi possível consultar esta página do histórico. Nenhum registro
            vazio é presumido;{" "}
            {selectedPage
              ? "a última página recebida está marcada como desatualizada."
              : "tente atualizar quando a conexão estiver disponível."}
          </Notice>
        ) : null}
        {errorText && selectedPage ? (
          <Notice warning>Dados em cache, somente para consulta.</Notice>
        ) : null}
        {!selectedPage && !historyQuery.isLoading && !errorText ? (
          <Notice warning>
            Nenhuma página do histórico foi recebida. Aguarde a consulta ou
            atualize; isso não representa um histórico vazio.
          </Notice>
        ) : null}
        {selectedPage &&
        !selectedPage.items.length &&
        selectedPage.totalCount === 0 ? (
          <Notice>
            Nenhum fechamento consta no histórico fornecido pelo servidor.
          </Notice>
        ) : null}
        {selectedPage && selectedPage.items.length ? (
          <>
            <DetailRow
              label="Fechamentos no histórico"
              value={String(selectedPage.totalCount)}
            />
            {selectedPage.items.map((closing) => (
              <View key={closing.id} style={{ gap: 10 }}>
                <ClosingSummary closing={closing} unitName={unitName} />
                <Button
                  compact
                  variant="secondary"
                  onPress={() => toggleClosing(closing)}
                >
                  {selectedClosing?.id === closing.id
                    ? "Ocultar detalhes"
                    : `Detalhes e ledger da abertura #${closing.openingId}`}
                </Button>
                {selectedClosing?.id === closing.id ? (
                  <ClosingDetails
                    closing={selectedClosing}
                    unitName={unitName}
                    screenActive={screenActive}
                    allowedToRead={allowedToRead}
                    ledgerRequested={ledgerRequested}
                    onConsultLedger={() => setLedgerRequested(true)}
                  />
                ) : null}
              </View>
            ))}
          </>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
          <View style={{ flexGrow: 1, flexBasis: 150 }}>
            <Button
              compact
              variant="secondary"
              disabled={
                !historyEnabled ||
                cursorState.length === 0 ||
                historyQuery.isFetching
              }
              onPress={openNewerPage}
            >
              Página mais recente
            </Button>
          </View>
          <View style={{ flexGrow: 1, flexBasis: 150 }}>
            <Button
              compact
              variant="secondary"
              disabled={
                !historyEnabled ||
                Boolean(errorText) ||
                selectedPage?.nextCursor === null ||
                selectedPage?.nextCursor === undefined ||
                historyQuery.isFetching
              }
              onPress={openOlderPage}
            >
              Fechamentos anteriores
            </Button>
          </View>
          <View style={{ flexGrow: 1, flexBasis: 150 }}>
            <Button
              compact
              variant="ghost"
              disabled={!historyEnabled || historyQuery.isFetching}
              onPress={() => void historyQuery.refetch()}
            >
              Atualizar histórico
            </Button>
          </View>
        </View>
        {!allowedToRead ? (
          <Notice warning>
            Seu perfil não pode consultar o histórico de caixa.
          </Notice>
        ) : null}
      </Card>
    </View>
  );
}

function ClosingSummary({
  closing,
  unitName,
}: {
  closing: CashClosing;
  unitName: string;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: C.line,
        borderRadius: 13,
        padding: 14,
        gap: 8,
      }}
    >
      <Label>
        FECHAMENTO #{closing.id} · ABERTURA #{closing.openingId}
      </Label>
      <DetailRow
        label="Unidade / caixa"
        value={`${unitName} · Caixa #${closing.registerId}`}
      />
      <DetailRow
        label="Fechador autenticado"
        value={`${closing.closedBy} · ID ${closing.closedById}`}
      />
      <DetailRow
        label="Autor da abertura"
        value={`${closing.opening.operator} · ID ${closing.opening.operatorId}`}
      />
      <DetailRow
        label="Data e turno operacionais originais"
        value={`${operationDateLabel(closing.opening.operationDate)} · ${closing.opening.shift.label} (${closing.opening.shift.start}–${closing.opening.shift.end})`}
      />
      <DetailRow
        label="Abertura / fechamento · Bauru"
        value={`${timestampLabel(closing.opening.openedAt)} · ${timestampLabel(closing.closedAt)}`}
      />
      <DetailRow
        label="Status"
        value={
          closing.status === "diferenca-pendente"
            ? "Diferença pendente"
            : "Fechado"
        }
      />
      <DetailRow
        label="Corte do ledger · último ID / quantidade congelada"
        value={`${closing.lastMovementId ?? "nenhum"} · ${closing.totals.movementCount}`}
      />
      {closing.status === "diferenca-pendente" ? (
        <DetailRow
          label="Justificativa manual"
          value={closing.varianceReason}
        />
      ) : null}
    </View>
  );
}

function ClosingDetails({
  closing,
  unitName,
  screenActive,
  allowedToRead,
  ledgerRequested,
  onConsultLedger,
}: {
  closing: CashClosing;
  unitName: string;
  screenActive: boolean;
  allowedToRead: boolean;
  ledgerRequested: boolean;
  onConsultLedger: () => void;
}) {
  const [showSummary, setShowSummary] = useState(true);
  const totals = closing.totals;
  return (
    <View style={{ gap: 12 }}>
      <ClosingSummary closing={closing} unitName={unitName} />
      {showSummary ? (
        <View style={{ gap: 8 }}>
          <Label>FOTOGRAFIA COMPLETA CONGELADA</Label>
          <DetailRow
            label="Fundo de abertura"
            value={formatCents(totals.openingFloat)}
          />
          <DetailRow
            label="Vendas registradas"
            value={formatCents(totals.sales)}
          />
          <DetailRow
            label="Contas anteriores recebidas"
            value={formatCents(totals.previousReceipts)}
          />
          <DetailRow label="Suprimentos" value={formatCents(totals.supplies)} />
          <DetailRow label="Sangrias" value={formatCents(totals.withdrawals)} />
          <View style={{ gap: 8 }}>
            <Label>ESPERADO · CONFERIDO · DIFERENÇA ASSINADA</Label>
            {(
              [
                ["Dinheiro", "dinheiro"],
                ["Pix", "pix"],
                ["Débito", "debito"],
                ["Crédito", "credito"],
              ] as const
            ).map(([label, method]) => (
              <DetailRow
                key={method}
                label={label}
                value={`${formatCents(totals.expectedByMethod[method])} · ${formatCents(totals.countedByMethod[method])} · ${signedCents(totals.differenceByMethod[method])}`}
              />
            ))}
          </View>
        </View>
      ) : null}
      <Button
        compact
        variant="ghost"
        onPress={() => setShowSummary((previous) => !previous)}
      >
        {showSummary
          ? "Recolher resumo congelado"
          : "Expandir resumo congelado"}
      </Button>
      <Button
        compact
        variant="secondary"
        disabled={!allowedToRead || !screenActive || !closing.openingId}
        onPress={onConsultLedger}
      >
        {`Consultar movimentos imutáveis da abertura #${closing.openingId}`}
      </Button>
      {ledgerRequested ? (
        <ClosureLedger
          key={closing.id}
          closing={closing}
          enabled={screenActive && allowedToRead}
        />
      ) : null}
    </View>
  );
}

function ClosureLedger({
  closing,
  enabled,
}: {
  closing: CashClosing;
  enabled: boolean;
}) {
  const [cursorStack, setCursorStack] = useState<number[]>([]);
  const cursor = cursorStack[cursorStack.length - 1];
  const query = trpc.cash.movementHistory.useQuery(
    {
      openingId: closing.openingId,
      limit: 50,
      ...(cursor === undefined ? {} : { cursor }),
    },
    {
      enabled,
      retry: false,
      gcTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: enabled,
      refetchInterval: enabled ? 15_000 : false,
      refetchIntervalInBackground: false,
    },
  );
  const rawPage = query.data as MovementHistoryPage | undefined;
  const page = rawPage?.openingId === closing.openingId ? rawPage : undefined;
  const wrongOpening = Boolean(
    rawPage && rawPage.openingId !== closing.openingId,
  );
  const overCut = Boolean(
    page &&
    page.items.some(
      (movement) =>
        closing.lastMovementId === null || movement.id > closing.lastMovementId,
    ),
  );
  const error = wrongOpening
    ? "O servidor retornou ledger de outra abertura."
    : overCut
      ? "A página contém um movimento posterior ao corte congelado do fechamento."
      : (query.error?.message ?? "");

  function older() {
    const nextCursor = page?.nextCursor;
    if (nextCursor === null || nextCursor === undefined) return;
    setCursorStack((previous) => [...previous, nextCursor]);
  }

  function newer() {
    setCursorStack((previous) => previous.slice(0, -1));
  }

  return (
    <View
      style={{
        gap: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderColor: C.line,
      }}
    >
      <Label>LEDGER IMUTÁVEL · ABERTURA #{closing.openingId}</Label>
      <DetailRow
        label="Corte registrado no fechamento"
        value={`Último movimento #${closing.lastMovementId ?? "nenhum"} · ${closing.totals.movementCount} movimentos congelados`}
      />
      {query.isLoading && !page ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ActivityIndicator size="small" color={C.green} />
          <Body size={11}>Consultando ledger no servidor…</Body>
        </View>
      ) : null}
      {query.isFetching && page ? (
        <Body size={11}>Atualizando página de movimentos…</Body>
      ) : null}
      {error ? (
        <Notice warning>
          A consulta do ledger falhou ou não corresponde ao corte. Nenhuma lista
          vazia é presumida; tente atualizar quando houver conexão.
        </Notice>
      ) : null}
      {!page && !query.isLoading && !error ? (
        <Notice warning>
          Nenhuma página do ledger foi recebida; isso não significa que não
          houve movimentos.
        </Notice>
      ) : null}
      {page && !page.items.length && page.totalCount === 0 && !error ? (
        <Notice>
          O servidor informa zero movimentos nesta abertura congelada.
        </Notice>
      ) : null}
      {page ? (
        <>
          <DetailRow
            label="Total informado pela página do servidor"
            value={String(page.totalCount)}
          />
          {page.totalCount !== closing.totals.movementCount ? (
            <Notice warning>
              A quantidade informada pelo ledger difere da contagem congelada no
              fechamento. Os valores são mostrados como recebidos; nenhum total
              foi recalculado nesta tela.
            </Notice>
          ) : null}
          {page.items.map((movement) => (
            <MovementRow key={movement.id} movement={movement} />
          ))}
        </>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button
          compact
          variant="secondary"
          disabled={!enabled || cursorStack.length === 0 || query.isFetching}
          onPress={newer}
        >
          Mais recentes
        </Button>
        <Button
          compact
          variant="secondary"
          disabled={
            !enabled ||
            Boolean(error) ||
            page?.nextCursor === null ||
            page?.nextCursor === undefined ||
            query.isFetching
          }
          onPress={older}
        >
          Mais antigos
        </Button>
        <Button
          compact
          variant="ghost"
          disabled={!enabled || query.isFetching}
          onPress={() => void query.refetch()}
        >
          Atualizar ledger
        </Button>
      </View>
    </View>
  );
}

function MovementRow({ movement }: { movement: CashMovement }) {
  const paymentMethod = {
    dinheiro: "Dinheiro",
    pix: "Pix",
    debito: "Débito",
    credito: "Crédito",
  }[movement.paymentMethod];
  const type = {
    recebimento: "Recebimento",
    sangria: "Sangria",
    suprimento: "Suprimento",
  }[movement.type];
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: C.line,
        borderRadius: 11,
        padding: 11,
        gap: 6,
      }}
    >
      <Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 12 }}>
        Movimento #{movement.id} · {type} · {formatCents(movement.amount)}
      </Text>
      <Body size={11}>
        {paymentMethod} · {movement.description}
        {movement.reference ? ` · Ref. ${movement.reference}` : ""}
      </Body>
      <Body size={10}>
        {timestampLabel(movement.recordedAt)} · {movement.responsible} · ID{" "}
        {movement.responsibleId}
      </Body>
    </View>
  );
}
