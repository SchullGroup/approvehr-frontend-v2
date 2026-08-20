import type { Metadata } from "next";
import { EquipmentScreen } from "./equipment-screen";

export const metadata: Metadata = {
  title: "Equipment",
  description:
    "Every laptop, phone and SIM card the company owns: who has each one, what state it is in, and what has to come back when somebody leaves.",
};

export default function EquipmentPage() {
  return <EquipmentScreen />;
}
