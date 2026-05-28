import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import ScrollProgress from "@/components/landing/ScrollProgress";

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-paper text-ink">
      <ScrollProgress />
      <LandingNav />
      <main className="pt-14">{children}</main>
      <LandingFooter />
    </div>
  );
}
