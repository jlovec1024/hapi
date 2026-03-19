import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
}

const SITE_NAME = "Zhushen";
const SITE_URL = "https://app.zhushen.run";
const DEFAULT_IMAGE = "/images/og-image.png";

const TITLE_BY_LANG = {
  en: "Zhushen - Vibe Coding Anytime, Anywhere",
  zh: "主神 - 随时随地，自由编程",
} as const;

const DESCRIPTION_BY_LANG = {
  en: "Zhushen is the local-first AI agent platform for developers who love freedom. Go for a hike, grab a coffee, or just relax while your AI agents work in the background.",
  zh: "主神是为热爱自由的开发者打造的本地优先 AI 代理平台。去徒步，去喝咖啡，或者只是放松一下，让你的 AI 代理在后台持续工作。",
} as const;

export function SEO({ title, description, image, url }: SEOProps) {
  const { i18n } = useTranslation();
  const currentLang = i18n.language.startsWith("zh") ? "zh" : "en";

  const siteTitle = TITLE_BY_LANG[currentLang];
  const defaultDescription = DESCRIPTION_BY_LANG[currentLang];

  const metaTitle = title ? `${title} | ${SITE_NAME}` : siteTitle;
  const metaDescription = description || defaultDescription;
  const metaImage = image ? `${SITE_URL}${image}` : `${SITE_URL}${DEFAULT_IMAGE}`;
  const metaUrl = url ? `${SITE_URL}${url}` : SITE_URL;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: currentLang === "zh" ? "主神" : SITE_NAME,
    operatingSystem: "Windows, macOS, Linux",
    applicationCategory: "DeveloperApplication",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    description: metaDescription,
  };

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <html lang={currentLang} />
      <title>{metaTitle}</title>
      <meta name="description" content={metaDescription} />
      <link rel="canonical" href={metaUrl} />
      
      {/* Hreflang Tags for SEO */}
      <link rel="alternate" hrefLang="en" href={`${SITE_URL}?lng=en`} />
      <link rel="alternate" hrefLang="zh" href={`${SITE_URL}?lng=zh`} />
      <link rel="alternate" hrefLang="x-default" href={SITE_URL} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={metaUrl} />
      <meta property="og:title" content={metaTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:image" content={metaImage} />
      <meta property="og:locale" content={currentLang === 'zh' ? 'zh_CN' : 'en_US'} />
      <meta property="og:site_name" content={currentLang === "zh" ? "主神" : SITE_NAME} />

      {/* Twitter */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={metaUrl} />
      <meta property="twitter:title" content={metaTitle} />
      <meta property="twitter:description" content={metaDescription} />
      <meta property="twitter:image" content={metaImage} />
      <meta name="twitter:creator" content="@tiann" />

      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(structuredData)}
      </script>
    </Helmet>
  );
}
