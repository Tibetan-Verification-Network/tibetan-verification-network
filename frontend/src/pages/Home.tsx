import { useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

import { buttonVariants } from "@/components/ui/button";
import { Button } from "../components/Button";
import { DocumentTitle } from "../components/DocumentTitle";
import { SearchControl } from "../components/SearchControl";
import { useI18n } from "../i18n/useI18n";
import { useLocalePath } from "../i18n/useLocalePath";

gsap.registerPlugin(useGSAP);

const HERO_IMAGE = { width: 1024, height: 597 };
const HERO_PILL = { left: 0.208, top: 0.6415, width: 0.584, height: 0.1273 };
const HERO_GROUP_SCALE = 0.88;
const SEARCH_PROMPTS = ["a claim you have seen", "news about Tibet", "river in winter"];
const HEADLINE_FIRST_LINE = "A Resilient and Trusted";

function headlineLines(headline: string) {
  const rest = headline.startsWith(`${HEADLINE_FIRST_LINE} `)
    ? headline.slice(HEADLINE_FIRST_LINE.length + 1)
    : "";
  if (rest === "") return headline;
  return (
    <>
      <span className="home-headline-line">{HEADLINE_FIRST_LINE}</span>{" "}
      <span className="home-headline-line">{rest}</span>
    </>
  );
}

function heroPlacement(width: number, height: number) {
  const cover = Math.max(width / HERO_IMAGE.width, height / HERO_IMAGE.height);
  const drawnWidth = HERO_IMAGE.width * cover * HERO_GROUP_SCALE;
  const drawnHeight = HERO_IMAGE.height * cover * HERO_GROUP_SCALE;
  const offsetX = (width - drawnWidth) / 2;
  const offsetY = (height - drawnHeight) / 2;
  const pillTop = offsetY + HERO_PILL.top * drawnHeight;
  const pillHeight = HERO_PILL.height * drawnHeight;
  const margin = 12;
  let searchLeft = offsetX + HERO_PILL.left * drawnWidth;
  let searchWidth = HERO_PILL.width * drawnWidth;
  if (searchLeft < margin) {
    searchWidth -= margin - searchLeft;
    searchLeft = margin;
  }
  if (searchLeft + searchWidth > width - margin) {
    searchWidth = Math.max(0, width - margin - searchLeft);
  }
  const heads = offsetY + drawnHeight * 0.36;
  return {
    image: {
      left: offsetX,
      top: offsetY,
      width: drawnWidth,
      height: drawnHeight,
      right: "auto",
      bottom: "auto",
    } satisfies CSSProperties,
    search: {
      left: searchLeft,
      top: pillTop,
      width: searchWidth,
      height: pillHeight,
    } satisfies CSSProperties,
    copy: {
      top: Math.max(8, offsetY + 8),
      bottom: Math.max(8, height - heads),
    } satisfies CSSProperties,
    after: {
      top: pillTop + pillHeight,
      bottom: Math.max(0, height - (offsetY + drawnHeight)),
    } satisfies CSSProperties,
  };
}

export function Home() {
  const { t } = useI18n();
  const to = useLocalePath();
  const navigate = useNavigate();
  const heroRef = useRef<HTMLElement>(null);
  const bannerRef = useRef<HTMLElement>(null);
  const ghostRef = useRef<HTMLSpanElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const [query, setQuery] = useState("");
  const [placement, setPlacement] = useState<ReturnType<typeof heroPlacement> | null>(null);

  useLayoutEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;

    function measure() {
      if (!hero) return;
      if (hero.clientWidth === 0 || hero.clientHeight === 0) return;
      setPlacement(heroPlacement(hero.clientWidth, hero.clientHeight));
    }

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  useGSAP(
    () => {
      const motion = gsap.matchMedia();
      motion.add("(prefers-reduced-motion: no-preference)", () => {
        const hero = heroRef.current;
        const ghost = ghostRef.current;
        const caret = caretRef.current;
        const input = hero?.querySelector<HTMLInputElement>("#home-search");
        if (!hero || !ghost || !input) return;

        const intro = gsap.timeline({ defaults: { ease: "power2.out" } });
        const photo = hero.querySelector("img");
        if (photo) {
          intro.from(photo, { scale: 1.045, duration: 1.8, ease: "power1.out" }, 0);
        }
        intro.from(
          hero.querySelectorAll(".home-kicker, .home-intro h1, .lede, .home-note"),
          { y: 18, opacity: 0, duration: 0.7, stagger: 0.1 },
          0.12,
        );
        intro.from(
          hero.querySelectorAll(".home-hero-search .field, .home-hero-search button[type='submit']"),
          { y: 12, opacity: 0, duration: 0.65 },
          0.28,
        );
        if (bannerRef.current) {
          intro.from(bannerRef.current, { y: 18, opacity: 0, duration: 0.7 }, 0.45);
        }

        if (caret) {
          gsap.to(caret, { opacity: 0, duration: 0.55, repeat: -1, yoyo: true, ease: "none" });
        }

        const typing = gsap.timeline({ repeat: -1, defaults: { ease: "none" } });
        for (const phrase of SEARCH_PROMPTS) {
          const counter = { count: 0 };
          typing.to(counter, {
            count: phrase.length,
            duration: Math.max(phrase.length * 0.048, 0.4),
            onUpdate: () => {
              ghost.textContent = phrase.slice(0, Math.round(counter.count));
            },
          });
          typing.to(counter, { duration: 1.15 });
          typing.to(counter, {
            count: 0,
            duration: Math.max(phrase.length * 0.03, 0.25),
            onUpdate: () => {
              ghost.textContent = phrase.slice(0, Math.round(counter.count));
            },
          });
          typing.to(counter, { duration: 0.35 });
        }

        const ghostWrap = ghost.parentElement;
        function syncGhost() {
          const busy = input.value.trim() !== "" || document.activeElement === input;
          if (!ghostWrap) return;
          if (busy) {
            typing.pause();
            gsap.set(ghostWrap, { autoAlpha: 0 });
          } else {
            gsap.set(ghostWrap, { autoAlpha: 1 });
            typing.play();
          }
        }

        input.addEventListener("focus", syncGhost);
        input.addEventListener("blur", syncGhost);
        input.addEventListener("input", syncGhost);
        syncGhost();
        return () => {
          input.removeEventListener("focus", syncGhost);
          input.removeEventListener("blur", syncGhost);
          input.removeEventListener("input", syncGhost);
        };
      });
      return () => motion.revert();
    },
    { scope: heroRef },
  );

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    navigate(
      trimmed === "" ? to("fact-checks") : `${to("fact-checks")}?q=${encodeURIComponent(trimmed)}`,
    );
  }

  return (
    <>
      <DocumentTitle title={t("product.name")} />
      <section className="home-hero" ref={heroRef}>
        <img
          src="/home-hero-field.png"
          alt={t("home.banner.alt")}
          width={3072}
          height={1791}
          style={placement?.image}
        />
        <form
          className="home-hero-search search-form"
          role="search"
          aria-label={t("home.searchLabel")}
          style={placement?.search}
          onSubmit={onSearch}
        >
          <SearchControl
            id="home-search"
            label={t("home.searchLabel")}
            value={query}
            clearLabel={t("search.clearQuery")}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery("")}
            overlay={
              <span className="home-search-ghost" aria-hidden="true">
                <span ref={ghostRef} />
                <span ref={caretRef} className="home-search-caret" />
              </span>
            }
          />
          <Button type="submit">{t("home.searchSubmit")}</Button>
        </form>
        <div className="home-intro" style={placement?.copy}>
          <p className="home-kicker">{t("home.kicker")}</p>
          <h1>{headlineLines(t("home.headline"))}</h1>
        </div>
        <div className="home-after" style={placement?.after}>
          <p className="lede">{t("home.lede")}</p>
          <h2 className="home-note">{t("home.note")}</h2>
        </div>
      </section>

      <section className="member-banner" aria-labelledby="home-member" ref={bannerRef}>
        <div className="member-banner-copy">
          <p className="member-banner-kicker">{t("home.member.kicker")}</p>
          <h2 id="home-member">{t("home.member.title")}</h2>
          <p>{t("home.member.body")}</p>
        </div>
        <Link
          className={buttonVariants({ variant: "outline" })}
          data-slot="button"
          to={to("membership")}
        >
          {t("home.member.cta")}
        </Link>
      </section>
    </>
  );
}
