import { AnnouncementBar, MarketingFooter, MarketingNav } from "@/components/marketing/chrome";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-sand text-slate-soft">
      <AnnouncementBar />
      <MarketingNav />
      <main id="main">{children}</main>
      <MarketingFooter />
    </div>
  );
}
