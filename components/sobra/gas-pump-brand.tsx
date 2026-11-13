import React from "react";
import { Image } from "react-native";

export function GasPumpBrand({ width = 180 }: { width?: number }) {
  return (
    <Image
      source={require("@/assets/images/gas-pump-logo.png")}
      style={{ width, height: width * 238 / 426, borderRadius: 6 }}
      resizeMode="contain"
      accessibilityLabel="GAS PUMP, gestão de postos"
    />
  );
}
