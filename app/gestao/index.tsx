import React from "react";
import { Redirect } from "expo-router";

export default function GestaoHome() {
  return <Redirect href={"/gestao/pista" as any} />;
}
