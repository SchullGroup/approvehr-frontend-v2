import type { Metadata } from "next";
import { LocationsScreen } from "./locations-screen";

export const metadata: Metadata = {
  title: "Work locations",
  description:
    "The offices, branches and sites people clock in at, and the geofence around each one.",
};

export default function WorkLocationsPage() {
  return <LocationsScreen />;
}
