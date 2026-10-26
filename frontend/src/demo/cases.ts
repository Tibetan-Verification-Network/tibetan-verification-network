import type { PublicCard, Verdict } from "../api/public";
import type { MessageKey } from "../i18n/locales/en";

/**
 * Frontend-only demonstration copy. These entries are not investigations,
 * are not stored in the database, and must stay labeled as demonstrations.
 */
export const DEMO_TOPICS = [
  "ai-generated",
  "impersonation",
  "manipulated-media",
  "coordinated",
] as const;

export type DemoTopic = (typeof DEMO_TOPICS)[number];

export const DEMO_TOPIC_KEY: Record<DemoTopic, MessageKey> = {
  "ai-generated": "tag.ai-generated",
  impersonation: "tag.impersonation",
  "manipulated-media": "tag.manipulated-media",
  coordinated: "tag.coordinated",
};

export interface DemoSource {
  title: string;
  url: string | null;
  publisher: string;
}

export interface DemoCase {
  slug: string;
  title: string;
  summary: string;
  claim: string;
  verdict: Verdict;
  topic: DemoTopic;
  reportedAt: string;
  status: string;
  explanation: string;
  limits: string;
  sources: DemoSource[];
}

export const DEMO_CASES: readonly DemoCase[] = [
  {
    slug: "demo-temple-clip",
    title: "Video does not show Chinese authorities demolishing a Tibetan temple",
    summary:
      "A 15-second clip shared in late April 2026 is synthetic. It is not footage of a Tibetan monastery.",
    claim:
      "This video shows the Chinese government using an excavator to destroy a Tibetan temple.",
    verdict: "false",
    topic: "ai-generated",
    reportedAt: "2026-05-07T05:23:00Z",
    status:
      "AFP reported that the clip is AI-generated. The finding applies to this video, not to every report of demolition in Tibet.",
    explanation:
      "Posts on X presented the clip as current evidence of a temple demolition, in Chinese, English, Japanese, and Korean, around the 26 April 2026 exile election. AFP described visual failures in the clip, a Hive Moderation result identifying OpenAI’s Sora 2, and a statement from the International Campaign for Tibet that the building was not recognizably Tibetan and did not match the monasteries in the Central Tibetan Administration’s 2025 stupa-demolition report.",
    limits:
      "Documented destruction of Tibetan religious buildings is a separate record. This demonstration does not assess those events. The Tibetan Verification Network has not investigated this clip.",
    sources: [
      {
        title: "AI clip of 'Chinese government tearing down Tibetan temple' misleads online",
        url: "https://factcheck.afp.com/doc.afp.com.A9JY2KE",
        publisher: "AFP Fact Check",
      },
    ],
  },
  {
    slug: "demo-forged-letter",
    title:
      "Letter on Dalai Lama Office letterhead does not document a meeting with Jeffrey Epstein",
    summary:
      "In February 2026, a Facebook account posted a document in the Office’s letterhead claiming a meeting. The Office denied any meeting or authorized contact.",
    claim: "An official letter shows that the Dalai Lama met Jeffrey Epstein.",
    verdict: "false",
    topic: "impersonation",
    reportedAt: "2026-02-11T00:00:00Z",
    status:
      "The Office denied the meeting on 8 February 2026. The Central Tibetan Administration said the document was forged. This draft does not re-examine the Epstein files.",
    explanation:
      "The Central Tibetan Administration said an account named Kallistos Rhys joined the Facebook group Free TIBET Movement on 17 January 2026 and posted the document. Its Department of Security traced the material to an article on the Vancouver-based site westca.com. The group administrator removed the account. News reports describe file references that do not themselves establish a meeting. The Administration’s statement that the smear originated in China is its own assessment.",
    limits:
      "A name appearing in a document set is a different claim and is not given a verdict here. No independent document laboratory is cited. This is not a published investigation.",
    sources: [
      {
        title: "Press statement, 8 February 2026",
        url: "https://www.dalailama.com/news/press-statement",
        publisher: "Office of His Holiness the Dalai Lama",
      },
      {
        title: "Alert on a forged document using the Office letterhead",
        url: "https://tibet.net/central-tibetan-administration-issues-alert-over-circulation-of-forged-document-using-official-letterhead-of-his-holiness-the-dalai-lama/",
        publisher: "Central Tibetan Administration",
      },
      {
        title: "CTA condemns fake letter claiming Dalai Lama–Epstein meeting",
        url: "https://phayul.com/cta-condemns-fake-letter-claiming-dalai-lama-epstein-meeting-calls-it-china-originated-smear-campaign/",
        publisher: "Phayul",
      },
    ],
  },
  {
    slug: "demo-election-network",
    title: "Inauthentic accounts amplified attacks on the 2026 exile election",
    summary:
      "Researchers documented Spamouflage-linked accounts posting corruption and election-manipulation narratives. The research documents the coordination. It does not decide the underlying allegations.",
    claim:
      "Viral posts show that the 2026 exile election was manipulated and that Penpa Tsering is corrupt.",
    verdict: "unclear",
    topic: "coordinated",
    reportedAt: "2026-04-24T00:00:00Z",
    status:
      "Graphika and the Digital Forensic Research Lab documented coordinated inauthentic accounts. Neither report verifies or refutes a specific corruption allegation.",
    explanation:
      "Around the February 2026 vote, Graphika assessed with high confidence that Tumblr accounts in the Spamouflage network published English and Tibetan articles, and that 103 accounts on X posted cartoons of candidates. Ahead of the 26 April parliamentary vote, the Digital Forensic Research Lab assessed with high confidence that 90 Facebook profiles and 13 Instagram profiles were part of a related operation. Some posts were attached to disputes already circulating among Tibetans. Organic engagement was very limited.",
    limits:
      "A reader can use these reports for the existence of the network. A reader cannot treat the network’s accusations as findings. Any specific allegation would need its own evidence review. This demonstration is not that review.",
    sources: [
      {
        title: "Deepfakes, Noise, and Doubt: AI's Role in Three Recent Elections",
        url: "https://www.graphika.com/blogs/deepfakes-noise-and-doubt-ai-s-role-in-three-recent-elections",
        publisher: "Graphika",
      },
      {
        title: "China-linked Spamouflage targets Tibetan parliament-in-exile elections",
        url: "https://dfrlab.org/2026/04/24/china-linked-spamouflage-targets-tibetan-parliament-in-exile-elections/",
        publisher: "DFRLab",
      },
    ],
  },
  {
    slug: "demo-flood-clips",
    title: "Two viral videos do not show the 26 August 2026 Himalayan flood",
    summary:
      "AFP identified one clip filmed earlier at Alaska’s Columbia Glacier and another clip generated with Google’s AI tools. Both were shared as scenes from the disaster.",
    claim:
      "These videos show the glacial collapse and the flooding that followed on 26 August 2026.",
    verdict: "false",
    topic: "manipulated-media",
    reportedAt: "2026-09-14T07:14:00Z",
    status:
      "False for the two videos AFP identified. Claims about the death toll inside Tibet are outside this finding.",
    explanation:
      "AFP reported that one video presented as the collapse had been filmed at Alaska’s Columbia Glacier, and that another video of a riverbank breach was made with Google’s AI tools. Scientists cited by AFP attribute the trigger of the disaster to a glacial collapse in Nepal. AFP also reported a fraudulent donation post in Nepal, removal of some eyewitness video on Chinese platforms, and penalties against people accused of disputing official casualty figures.",
    limits:
      "This finding does not decide casualty figures, the fate of missing people, or whether a higher toll was concealed. A penalty for spreading a “rumor” is not a fact-check. The Tibetan Verification Network has not investigated these clips.",
    sources: [
      {
        title: "How China and Nepal are battling flood rumours online",
        url: "https://factcheck.afp.com/doc.afp.com.C88K4CQ",
        publisher: "AFP Fact Check",
      },
      {
        title: "Floods in Nepal and Tibet: restrictions and disinformation are impeding vital news",
        url: "https://rsf.org/en/floods-nepal-and-tibet-restrictions-and-disinformation-are-impeding-vital-news",
        publisher: "Reporters Without Borders",
      },
    ],
  },
  {
    slug: "demo-election-profile",
    title: "Placeholder: election logo used on an unofficial candidate profile",
    summary:
      "This entry is invented. It illustrates a pattern election observers described. It does not refer to a documented post.",
    claim:
      "A profile using the Central Tibetan Election Commission logo is an official candidate account.",
    verdict: "unverified",
    topic: "impersonation",
    reportedAt: "2026-06-01T00:00:00Z",
    status:
      "Insufficient evidence. There is no identified profile, logo, or account behind this card.",
    explanation:
      "In its June 2026 final report, the Asian Network for Free Elections said stakeholders had reported inaccurate election dates, misleading logos, fake candidate profiles, and AI-generated material. The report did not identify a specific post or account. This card uses a neutral placeholder so the category can be shown. Nothing in it should be read as an incident.",
    limits:
      "There is nothing here to verify. A real report would need the profile, the logo, the platform, and a comparison with an official account.",
    sources: [
      {
        title: "The Long Road Home: 2026 Elections for the 18th Tibetan Parliament-in-Exile",
        url: "https://anfrel.org/wp-content/uploads/2026/06/ANFREL_2026-Tibet_Final-Report_v3.1.pdf",
        publisher: "Asian Network for Free Elections",
      },
    ],
  },
];

export function demoCase(slug: string): DemoCase | undefined {
  return DEMO_CASES.find((item) => item.slug === slug);
}

/** Keep demonstration cards in step with the public search filters. */
export function matchingDemoCases(filters: {
  q: string;
  verdict: string;
  topic: string;
  from: string;
  to: string;
}): DemoCase[] {
  const needle = filters.q.trim().toLocaleLowerCase();
  return DEMO_CASES.filter((item) => {
    if (filters.verdict !== "" && item.verdict !== filters.verdict) return false;
    if (filters.topic !== "" && item.topic !== filters.topic) return false;
    const day = item.reportedAt.slice(0, 10);
    if (filters.from !== "" && day < filters.from) return false;
    if (filters.to !== "" && day > filters.to) return false;
    if (needle === "") return true;
    const haystack = `${item.title}\n${item.summary}\n${item.claim}`.toLocaleLowerCase();
    return haystack.includes(needle);
  });
}

export function demoCard(item: DemoCase): PublicCard {
  return {
    slug: item.slug,
    language: "en",
    title: item.title,
    summary: item.summary,
    verdict: item.verdict,
    topics: [item.topic],
    first_published_at: item.reportedAt,
    last_published_at: item.reportedAt,
  };
}
