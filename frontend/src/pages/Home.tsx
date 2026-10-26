import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

import { buttonVariants } from "@/components/ui/button";
import { Button } from "../components/Button";
import { DocumentTitle } from "../components/DocumentTitle";
import { FactCheckCard } from "../components/FactCheckCard";
import { SearchControl } from "../components/SearchControl";
import { DEMO_CASES, DEMO_TOPIC_KEY, DEMO_TOPICS, demoCard, type DemoTopic } from "../demo/cases";
import { useI18n } from "../i18n/useI18n";
import { useLocalePath } from "../i18n/useLocalePath";

gsap.registerPlugin(useGSAP);

const HERO_IMAGE = { width: 1024, height: 597 };
const HERO_PILL = { left: 0.208, top: 0.6415, width: 0.584, height: 0.1273 };
const HERO_GROUP_SCALE = 0.88;
const SEARCH_PROMPTS = [
  {
    bo: "གནས་ཚུལ་འདིའི་འབྱུང་ཁུངས་གང་ཡིན་ནམ།",
    en: "What is the source of this claim?",
  },
  {
    bo: "པར་འདི་ངོ་མ་ཡིན་ནམ།",
    en: "Is this image authentic?",
  },
  {
    bo: "གནས་ཚུལ་འདི་སྤེལ་མཁན་སུ་ཡིན་ནམ།",
    en: "Who is behind this information?",
  },
  {
    bo: "བརྒྱུད་སྐུལ་མ་བྱས་གོང་ལ་ཞིབ་བཤེར་གྱིས།",
    en: "Verify before you share.",
  },
];

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/** English advances one letter at a time. Tibetan advances one syllable at a time. */
function typingUnits(text: string): string[] {
  const units: string[] = [];
  let syllable = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const tibetan = code >= 0x0f00 && code <= 0x0fff;
    if (!tibetan) {
      if (syllable !== "") {
        units.push(syllable);
        syllable = "";
      }
      units.push(char);
      continue;
    }
    syllable += char;
    if (char === "་" || char === "།") {
      units.push(syllable);
      syllable = "";
    }
  }
  if (syllable !== "") units.push(syllable);
  return units;
}

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
  const [topic, setTopic] = useState<DemoTopic | "all">("all");
  const [placement, setPlacement] = useState<ReturnType<typeof heroPlacement> | null>(null);
  const visibleCases =
    topic === "all" ? DEMO_CASES : DEMO_CASES.filter((item) => item.topic === topic);

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

  useEffect(() => {
    const input = heroRef.current?.querySelector<HTMLInputElement>("#home-search");
    input?.dispatchEvent(new Event("input"));
  }, [query]);

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
          hero.querySelectorAll(
            ".home-hero-search .field, .home-hero-search button[type='submit']",
          ),
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
        const lines = shuffle(SEARCH_PROMPTS).flatMap((prompt) => [
          { text: prompt.bo, tibetan: true },
          { text: prompt.en, tibetan: false },
        ]);
        for (const line of lines) {
          const units = typingUnits(line.text);
          const counter = { count: 0 };
          const paint = () => {
            ghost.textContent = units.slice(0, Math.round(counter.count)).join("");
          };
          typing.to(counter, {
            count: units.length,
            duration: Math.max(units.length * (line.tibetan ? 0.14 : 0.046), 0.45),
            onUpdate: paint,
          });
          typing.to(counter, { duration: line.tibetan ? 1.4 : 1.15 });
          typing.to(counter, {
            count: 0,
            duration: Math.max(units.length * 0.03, 0.25),
            onUpdate: paint,
          });
          typing.to(counter, { duration: 0.32 });
        }

        const ghostWrap = ghost.parentElement;
        const fitGhost = () => {
          if (!ghostWrap || ghostWrap.clientWidth === 0) return;
          const probe = document.createElement("span");
          probe.style.position = "absolute";
          probe.style.visibility = "hidden";
          probe.style.whiteSpace = "nowrap";
          probe.style.font = "inherit";
          ghostWrap.append(probe);
          ghostWrap.style.fontSize = "";
          const caretSpace = (caret?.offsetWidth ?? 1) + 6;
          const available = Math.max(0, ghostWrap.clientWidth - caretSpace);
          let widest = 0;
          for (const line of lines) {
            probe.textContent = line.text;
            widest = Math.max(widest, probe.getBoundingClientRect().width);
          }
          probe.remove();
          if (widest <= available || available === 0) return;
          const px = Number.parseFloat(getComputedStyle(ghostWrap).fontSize);
          ghostWrap.style.fontSize = `${(px * available) / widest}px`;
        };
        fitGhost();
        void document.fonts?.ready.then(fitGhost);
        const fitObserver =
          typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fitGhost);
        fitObserver?.observe(ghostWrap ?? hero);
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
          fitObserver?.disconnect();
          ghostWrap?.style.removeProperty("font-size");
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

      <section className="home-cases" id="home-cases" aria-labelledby="home-cases-title">
        <div className="home-cases-heading">
          <p className="home-cases-kicker">{t("home.cases.kicker")}</p>
          <h2 id="home-cases-title">{t("home.cases.title")}</h2>
          <p className="lede">{t("home.cases.lead")}</p>
        </div>
        <div className="case-filters" role="group" aria-label={t("home.cases.filters")}>
          <button
            type="button"
            className="case-filter"
            aria-pressed={topic === "all"}
            onClick={() => setTopic("all")}
          >
            {t("home.cases.all")}
          </button>
          {DEMO_TOPICS.map((item) => (
            <button
              key={item}
              type="button"
              className="case-filter"
              aria-pressed={topic === item}
              onClick={() => setTopic(item)}
            >
              {t(DEMO_TOPIC_KEY[item])}
            </button>
          ))}
        </div>
        <p className="result-count" role="status">
          {visibleCases.length === 0
            ? t("home.cases.empty")
            : t("home.cases.count", { count: String(visibleCases.length) })}
        </p>
        <div className="card-list">
          {visibleCases.map((item) => (
            <FactCheckCard
              key={item.slug}
              card={demoCard(item)}
              headingLevel={3}
              href={to(`examples/${item.slug}`)}
              tags={[{ slug: item.topic, label: t(DEMO_TOPIC_KEY[item.topic]) }]}
              demo
              onTag={(slug) => {
                const match = DEMO_TOPICS.find((itemTopic) => itemTopic === slug);
                if (match !== undefined) setTopic(match);
              }}
            />
          ))}
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
