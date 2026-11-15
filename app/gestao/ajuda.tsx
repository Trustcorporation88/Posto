import React, { useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Body, Button, C, Card, F, Icon, Label } from "@/components/sobra/ui";
import { GestaoShell, useMe } from "@/components/sobra/gestao/gestao-shell";
import {
  helpSectionsFor,
  type HelpBlock,
  type HelpSectionId,
} from "@/lib/business/help-content";

const PDF_PATH = "/manual/Manual-GAS-PUMP.pdf";

function openPdf() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.open(PDF_PATH, "_blank", "noopener");
    return;
  }
  void Linking.openURL(PDF_PATH);
}

export default function Ajuda() {
  const session = useMe();
  const params = useLocalSearchParams<{ secao?: string }>();
  const role =
    (session.data as { role?: string } | null | undefined)?.role ?? "";
  const sections = helpSectionsFor(role);
  const requested =
    sections.find((section) => section.id === params.secao)?.id ?? null;

  return (
    <GestaoShell
      title="Ajuda"
      subtitle="Como usar cada tela do GAS PUMP, conforme o seu perfil."
    >
      <Card style={{ gap: 12 }}>
        <Label>MANUAL COMPLETO</Label>
        <Body>
          O mesmo conteúdo, com imagens das telas, está no manual em PDF. Pode
          ser impresso ou enviado para a equipe.
        </Body>
        <Button icon="download" variant="secondary" onPress={openPdf}>
          Baixar manual em PDF
        </Button>
      </Card>
      {/* Keyed by the requested section so a new "Como usar esta tela" link reopens it. */}
      <HelpSections
        key={requested ?? "inicio"}
        sections={sections}
        initial={requested ?? sections[0]?.id ?? null}
      />
    </GestaoShell>
  );
}

function HelpSections({
  sections,
  initial,
}: {
  sections: ReturnType<typeof helpSectionsFor>;
  initial: HelpSectionId | null;
}) {
  const [open, setOpen] = useState<HelpSectionId | null>(initial);
  return (
    <View style={{ gap: 10 }}>
      {sections.map((section) => {
        const expanded = open === section.id;
        return (
          <Card
            key={section.id}
            style={{ gap: expanded ? 14 : 0, padding: 0, overflow: "hidden" }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setOpen(expanded ? null : section.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                padding: 18,
              }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: expanded ? C.green : C.light,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon
                  name={section.icon}
                  size={18}
                  color={expanded ? C.lime : C.green}
                />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{ color: C.ink, fontFamily: F.heading, fontSize: 17 }}
                >
                  {section.title}
                </Text>
                <Text
                  style={{
                    color: C.muted,
                    fontFamily: F.regular,
                    fontSize: 12,
                  }}
                >
                  {section.summary}
                </Text>
              </View>
              <Icon
                name={expanded ? "chevron-up" : "chevron-down"}
                size={18}
                color={C.muted}
              />
            </Pressable>
            {expanded ? (
              <View
                style={{ gap: 14, paddingHorizontal: 18, paddingBottom: 20 }}
              >
                {section.blocks.map((block, index) => (
                  <HelpBlockView key={index} block={block} />
                ))}
              </View>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

function BlockTitle({ children }: { children?: string }) {
  return children ? (
    <Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 14 }}>
      {children}
    </Text>
  ) : null;
}

function HelpBlockView({ block }: { block: HelpBlock }) {
  switch (block.kind) {
    case "text":
      return (
        <Text
          style={{
            color: C.ink,
            fontFamily: F.regular,
            fontSize: 14,
            lineHeight: 21,
          }}
        >
          {block.text}
        </Text>
      );
    case "steps":
      return (
        <View style={{ gap: 8 }}>
          <BlockTitle>{block.title}</BlockTitle>
          {block.items.map((item, index) => (
            <View key={index} style={{ flexDirection: "row", gap: 10 }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: C.lime,
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 1,
                }}
              >
                <Text
                  style={{ color: C.green, fontFamily: F.bold, fontSize: 11 }}
                >
                  {index + 1}
                </Text>
              </View>
              <Text
                style={{
                  flex: 1,
                  color: C.ink,
                  fontFamily: F.regular,
                  fontSize: 14,
                  lineHeight: 21,
                }}
              >
                {item}
              </Text>
            </View>
          ))}
        </View>
      );
    case "list":
      return (
        <View style={{ gap: 6 }}>
          <BlockTitle>{block.title}</BlockTitle>
          {block.items.map((item, index) => (
            <View key={index} style={{ flexDirection: "row", gap: 10 }}>
              <Text
                style={{
                  color: C.green,
                  fontFamily: F.bold,
                  fontSize: 14,
                  lineHeight: 21,
                }}
              >
                •
              </Text>
              <Text
                style={{
                  flex: 1,
                  color: C.ink,
                  fontFamily: F.regular,
                  fontSize: 14,
                  lineHeight: 21,
                }}
              >
                {item}
              </Text>
            </View>
          ))}
        </View>
      );
    case "table":
      return (
        <View
          style={{
            borderWidth: 1,
            borderColor: C.line,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {block.rows.map((row, rowIndex) => (
            <View
              key={rowIndex}
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                padding: 12,
                borderTopWidth: rowIndex === 0 ? 0 : 1,
                borderTopColor: C.line,
                backgroundColor: rowIndex % 2 ? C.white : C.bg,
              }}
            >
              {row.map((cell, cellIndex) => (
                <View
                  key={cellIndex}
                  style={{
                    flexGrow: cellIndex === 1 ? 2 : 1,
                    flexBasis: cellIndex === 1 ? 260 : 140,
                    gap: 2,
                  }}
                >
                  <Text
                    style={{
                      color: C.muted,
                      fontFamily: F.bold,
                      fontSize: 10,
                      letterSpacing: 0.6,
                    }}
                  >
                    {block.head[cellIndex]?.toUpperCase()}
                  </Text>
                  <Text
                    style={{
                      color: C.ink,
                      fontFamily: cellIndex === 0 ? F.bold : F.regular,
                      fontSize: 13,
                      lineHeight: 19,
                    }}
                  >
                    {cell}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      );
    case "note":
      return (
        <View
          style={{
            backgroundColor: block.warning ? C.orangeBg : C.light,
            borderRadius: 10,
            padding: 12,
          }}
        >
          <Text
            style={{
              color: block.warning ? C.orange : C.ink,
              fontFamily: F.medium,
              fontSize: 13,
              lineHeight: 19,
            }}
          >
            {block.text}
          </Text>
        </View>
      );
  }
}
