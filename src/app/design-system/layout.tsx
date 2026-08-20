import { ToastProvider } from "@/components/ui";

export default function DesignSystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ToastProvider>{children}</ToastProvider>;
}
