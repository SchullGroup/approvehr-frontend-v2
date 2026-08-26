import Image from "next/image";
import { Marquee, Reveal } from "./motion";

/*
 * Client logos and testimonials, taken from approvehr.io. These are the
 * company's own existing relationships and quotes rather than anything
 * invented here.
 *
 * One quote from the live site is deliberately not carried over: it is
 * entirely about a Learning Management System, which the product does not
 * have. Quoting a customer praising a module that does not exist is the
 * fastest way to lose the deal in the demo.
 */

const CLIENTS = [
  { src: "/clients/schull.png", alt: "Schulltech", w: 430, h: 96 },
  { src: "/clients/nnpc.png", alt: "NNPC", w: 414, h: 120 },
  { src: "/clients/schullio.png", alt: "schull.io", w: 570, h: 120 },
  { src: "/clients/usce.png", alt: "USCE", w: 213, h: 120 },
  { src: "/clients/crffn.png", alt: "CRFFN", w: 209, h: 120 },
  { src: "/clients/beat.png", alt: "Beate Synergy", w: 252, h: 96 },
  { src: "/clients/fmm.png", alt: "Federal Ministry", w: 225, h: 120 },
  { src: "/clients/voz.png", alt: "Vomoz", w: 243, h: 120 },
];

export function ClientLogos() {
  return (
    <section className="border-y border-sand-line bg-sand-deep py-14">
      <p className="container-page mb-9 text-center text-body text-slate-muted">
        Trusted by Nigerian teams in energy, logistics, education and technology
      </p>
      <Marquee duration={55}>
        {CLIENTS.map((c) => (
          <Image
            key={c.src}
            src={c.src}
            alt={c.alt}
            width={c.w}
            height={c.h}
            className="h-9 w-auto object-contain opacity-55 transition-opacity duration-200 hover:opacity-100 sm:h-11"
          />
        ))}
      </Marquee>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

const TESTIMONIALS = [
  {
    quote:
      "Compliance and scale were what kept me up. Payroll and tax now run themselves, and I finally get numbers I can make decisions on instead of numbers I have to check.",
    name: "Ayo Oseni",
    role: "Founder",
    company: "USCExperts",
    avatar: "/avatars/ko.png",
  },
  {
    quote:
      "It is not just payroll. Recruitment, attendance, onboarding, leave, assets, the help desk — all of it sits in one place now. My team stops chasing people for information that should already be on the system.",
    name: "Miracle Ebalukhota",
    role: "Business Manager",
    company: "Beate Synergy",
    avatar: "/avatars/miracle.png",
  },
  {
    quote:
      "The work that used to eat whole days is automated. Reviews are fairer because they are scored the same way for everyone, and nobody argues about what the process was.",
    name: "Ebunoluwa Akinola",
    role: "Operations Manager",
    company: "Schull Technologies",
    avatar: "/avatars/ebun.png",
  },
];

export function Testimonials() {
  return (
    <section className="px-4 py-24">
      <div className="container-page">
        <Reveal>
          <h2 className="max-w-3xl text-h1 text-slate">
            The people who manage payroll here already made the switch.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} as="figure" delay={i * 80}>
              <div className="flex h-full flex-col rounded-3xl border border-sand-line bg-white/70 p-7">
                <blockquote className="flex-1 text-body-lg leading-relaxed text-slate">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-7 flex items-center gap-3 border-t border-sand-line pt-5">
                  <Image
                    src={t.avatar}
                    alt=""
                    width={44}
                    height={44}
                    className="size-11 shrink-0 rounded-full object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-body font-medium text-slate">
                      {t.name}
                    </p>
                    <p className="truncate text-meta text-slate-muted">
                      {t.role}, {t.company}
                    </p>
                  </div>
                </figcaption>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
