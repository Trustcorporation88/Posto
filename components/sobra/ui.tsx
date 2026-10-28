import React, { ReactNode } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  TextInputProps,
  ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const C = {
  bg: "#F6F5EF",
  white: "#FFFFFF",
  ink: "#172D28",
  green: "#214D40",
  muted: "#7A8279",
  line: "#E5E7DD",
  lime: "#DAE8B0",
  light: "#EDF1E5",
  orange: "#C86646",
  orangeBg: "#FBEEE7",
  blue: "#6896A1",
};
export const F = {
  regular: "DMSans_400Regular",
  medium: "DMSans_500Medium",
  bold: "DMSans_700Bold",
  heading: "Manrope_700Bold",
  extra: "Manrope_800ExtraBold",
};
export type IconName = React.ComponentProps<typeof Feather>["name"];
export function Icon({
  name,
  size = 20,
  color = C.ink,
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  return (
    <Feather
      name={
        ((
          {
            cart: "shopping-cart",
            restaurant: "coffee",
            car: "truck",
            sparkles: "sun",
            ellipsis: "more-horizontal",
          } as Record<string, string>
        )[name] ?? name) as IconName
      }
      size={size}
      color={color}
    />
  );
}
export function Label({
  children,
  color = C.muted,
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <Text
      style={{
        color,
        fontFamily: F.bold,
        fontSize: 10,
        letterSpacing: 1.7,
        textTransform: "uppercase",
      }}
    >
      {children}
    </Text>
  );
}
export function Body({
  children,
  color = C.muted,
  size = 13,
}: {
  children: ReactNode;
  color?: string;
  size?: number;
}) {
  return (
    <Text
      style={{
        color,
        fontFamily: F.regular,
        fontSize: size,
        lineHeight: size * 1.55,
      }}
    >
      {children}
    </Text>
  );
}
export function Button({
  children,
  onPress,
  icon,
  variant = "primary",
  disabled = false,
  compact = false,
}: {
  children: string;
  onPress: () => void;
  icon?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  compact?: boolean;
}) {
  const primary = variant === "primary";
  const color = primary ? C.white : variant === "danger" ? C.orange : C.green;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: compact ? 38 : 48,
        paddingHorizontal: compact ? 14 : 19,
        paddingVertical: 10,
        borderRadius: 13,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: primary
          ? C.green
          : variant === "secondary"
            ? C.light
            : variant === "danger"
              ? C.orangeBg
              : "transparent",
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      {icon && <Icon name={icon} size={compact ? 15 : 18} color={color} />}
      <Text style={{ color, fontFamily: F.bold, fontSize: compact ? 12 : 14 }}>
        {children}
      </Text>
    </Pressable>
  );
}
export function IconButton({
  name,
  onPress,
  label,
  color = C.ink,
}: {
  name: string;
  onPress: () => void;
  label: string;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? C.light : "transparent",
      })}
    >
      <Icon name={name} size={19} color={color} />
    </Pressable>
  );
}
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: C.white,
          borderRadius: 20,
          borderColor: C.line,
          borderWidth: 1,
          padding: 22,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function SectionTitle({
  title,
  eyebrow,
  action,
  onAction,
}: {
  title: string;
  eyebrow?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20,
        gap: 10,
      }}
    >
      <View style={{ gap: 6 }}>
        {eyebrow && <Label>{eyebrow}</Label>}
        <Text
          style={{
            fontFamily: F.heading,
            color: C.ink,
            fontSize: 19,
            letterSpacing: -0.65,
          }}
        >
          {title}
        </Text>
      </View>
      {action && (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={{ paddingVertical: 10 }}
        >
          <Text style={{ fontFamily: F.bold, color: C.green, fontSize: 12 }}>
            {action} ↗
          </Text>
        </Pressable>
      )}
    </View>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Label color={C.ink}>{label}</Label>
      <TextInput
        placeholderTextColor="#92998F"
        {...props}
        style={[styles.input, props.style]}
      />
    </View>
  );
}
export function Chip({
  children,
  selected,
  onPress,
  color,
}: {
  children: string;
  selected?: boolean;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        backgroundColor: selected ? C.green : C.white,
        borderWidth: 1,
        borderColor: selected ? C.green : C.line,
        borderRadius: 10,
        paddingHorizontal: 13,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      {color && (
        <View
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: color,
          }}
        />
      )}
      <Text
        style={{
          fontFamily: selected ? F.bold : F.medium,
          fontSize: 12,
          color: selected ? C.white : C.muted,
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
export function Notice({
  children,
  warning = false,
}: {
  children: ReactNode;
  warning?: boolean;
}) {
  return (
    <View
      style={{
        padding: 14,
        borderRadius: 12,
        backgroundColor: warning ? C.orangeBg : C.light,
        gap: 6,
      }}
    >
      <Text
        style={{
          fontFamily: F.regular,
          fontSize: 13,
          lineHeight: 20,
          color: warning ? "#9D452A" : C.green,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
export function Empty({
  title,
  text,
  action,
  onPress,
  icon = "inbox",
}: {
  title: string;
  text: string;
  action?: string;
  onPress?: () => void;
  icon?: string;
}) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 30, gap: 12 }}>
      <View style={{ padding: 15, borderRadius: 18, backgroundColor: C.light }}>
        <Icon name={icon} size={24} color={C.green} />
      </View>
      <Text
        style={{
          fontFamily: F.heading,
          color: C.ink,
          fontSize: 17,
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontFamily: F.regular,
          color: C.muted,
          fontSize: 13,
          lineHeight: 21,
          textAlign: "center",
          maxWidth: 300,
        }}
      >
        {text}
      </Text>
      {action && onPress && (
        <Button compact variant="secondary" onPress={onPress}>
          {action}
        </Button>
      )}
    </View>
  );
}
export function Sheet({
  visible,
  title,
  subtitle,
  children,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{
          flex: 1,
          backgroundColor: "#102C2866",
          justifyContent: width < 600 ? "flex-end" : "center",
          alignItems: "center",
          padding: width < 600 ? 0 : 24,
        }}
      >
        <Pressable
          accessibilityLabel="Fechar janela"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={{
            width: "100%",
            maxWidth: 560,
            maxHeight: "92%",
            borderRadius: 24,
            borderBottomLeftRadius: width < 600 ? 0 : 24,
            borderBottomRightRadius: width < 600 ? 0 : 24,
            backgroundColor: C.bg,
            paddingBottom: Math.max(insets.bottom, 20),
            overflow: "hidden",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 24,
              paddingBottom: 18,
            }}
          >
            <View style={{ flex: 1, gap: 5 }}>
              <Text
                style={{
                  fontFamily: F.heading,
                  color: C.ink,
                  fontSize: 23,
                  letterSpacing: -0.8,
                }}
              >
                {title}
              </Text>
              {subtitle && <Body>{subtitle}</Body>}
            </View>
            <IconButton name="x" label="Fechar" onPress={onClose} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 24,
              paddingBottom: 14,
              gap: 20,
            }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export const styles = StyleSheet.create({
  input: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 14,
    color: C.ink,
    fontFamily: F.regular,
    fontSize: 15,
    minHeight: 50,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  line: { height: 1, backgroundColor: C.line },
  title: {
    color: C.ink,
    fontFamily: F.extra,
    fontSize: 32,
    letterSpacing: -1.5,
  },
});
