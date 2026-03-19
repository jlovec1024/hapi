import Layout from "@/components/Layout";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Check, Cloud, Database, HardDrive, Lock, Server, Shield, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function VsComparison() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith("zh");

  const pageTitle = isZh ? "主神对比" : "Zhushen Comparison";
  const pageDescription = isZh
    ? "对比主神与其他常见远程 AI 开发方案的差异，帮助你选择更适合自己的本地优先工作流。"
    : "Compare Zhushen with common remote AI development approaches and choose the local-first workflow that fits you best.";

  return (
    <Layout>
      <SEO title={pageTitle} description={pageDescription} url="/comparison" />
      <section className="bg-secondary/10 py-20 md:py-32">
        <div className="container">
          <div className="mx-auto mb-16 max-w-3xl text-center">
            <h1 className="mb-6 text-4xl font-extrabold md:text-6xl">{pageTitle}</h1>
            {isZh ? (
              <>
                <p className="text-xl leading-relaxed text-muted-foreground">
                  这页用于帮助你理解主神与其他常见远程 AI 开发方案之间的取舍。
                </p>
                <p className="mt-4 text-lg">
                  简短答案：<strong>典型云端托管方案偏向 Cloud-First，主神偏向 Local-First。</strong>
                </p>
              </>
            ) : (
              <>
                <p className="text-xl leading-relaxed text-muted-foreground">
                  This page helps you understand the trade-offs between Zhushen and other common remote AI development approaches.
                </p>
                <p className="mt-4 text-lg">
                  The short answer: <strong>typical hosted solutions are Cloud-First, while Zhushen is Local-First.</strong>
                </p>
              </>
            )}
          </div>

          <div className="mb-20 grid grid-cols-1 gap-8 md:grid-cols-2">
            <Card className="relative overflow-hidden border-2 border-border bg-card shadow-hard">
              <div className="absolute left-0 top-0 h-2 w-full bg-blue-500"></div>
              <CardHeader className="pb-2">
                <div className="mb-2 flex items-center gap-3">
                  <Cloud className="h-8 w-8 text-blue-500" />
                  <CardTitle className="text-2xl">{isZh ? "典型云端托管方案" : "Typical Hosted Solutions"}</CardTitle>
                </div>
                <p className="text-sm font-bold uppercase tracking-wider text-blue-500">Cloud-First Design</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {isZh ? (
                  <>
                    <p className="text-muted-foreground">通常面向云端托管和多用户协作设计，核心目标是降低托管与团队使用门槛。</p>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
                        <span><strong>围绕中心化服务构建</strong>，数据与控制面更多依赖远端平台。</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
                        <span><strong>更强调团队协作</strong>，适合多成员共享与统一管理。</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
                        <span><strong>部署与运维更复杂</strong>，通常涉及多服务或外部基础设施。</span>
                      </li>
                    </ul>
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground">Usually designed for hosted deployments and multi-user collaboration, with the goal of reducing friction for managed usage.</p>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
                        <span><strong>Built around centralized services</strong>, with more reliance on remote control and storage layers.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
                        <span><strong>Optimized for collaboration</strong>, making shared usage and centralized management easier.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
                        <span><strong>More operational complexity</strong>, often involving multiple services or external infrastructure.</span>
                      </li>
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-2 border-primary bg-card shadow-hard-lg md:-translate-y-4">
              <div className="absolute left-0 top-0 h-2 w-full bg-primary"></div>
              <CardHeader className="pb-2">
                <div className="mb-2 flex items-center gap-3">
                  <HardDrive className="h-8 w-8 text-primary" />
                  <CardTitle className="text-2xl">{isZh ? "主神" : "Zhushen"}</CardTitle>
                </div>
                <p className="text-sm font-bold uppercase tracking-wider text-primary">Local-First Design</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {isZh ? (
                  <>
                    <p className="text-muted-foreground">面向单用户自托管设计，核心解决的是“随时安全远程接入自己的开发环境”问题。</p>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <span><strong>数据默认留在本机</strong>，减少对外部平台的依赖。</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <span><strong>单一嵌入式数据库</strong>（SQLite），无需为扩容付出复杂度。</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <span><strong>一条命令即可部署</strong>（单二进制、零配置）。</span>
                      </li>
                    </ul>
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground">Designed for self-hosting with a single user. It solves secure remote access to your own environment.</p>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <span><strong>Your data stays on your machine by default</strong>, reducing dependence on external platforms.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <span><strong>Single Embedded Database</strong> (SQLite), with no scaling tax.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <span><strong>One-Command Deployment</strong> (single binary, zero config).</span>
                      </li>
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mb-20 overflow-hidden rounded-2xl border-2 border-border bg-card shadow-hard">
            <div className="border-b-2 border-border bg-muted/30 p-6">
              <h2 className="text-center text-2xl font-bold">{isZh ? "能力对比" : "Feature Comparison"}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/10">
                    <th className="w-1/3 border-b border-border p-4 text-left font-bold">{isZh ? "维度" : "Dimension"}</th>
                    <th className="w-1/3 border-b border-border p-4 text-left font-bold text-blue-600">
                      {isZh ? "典型云端托管方案" : "Typical Hosted Solutions"}
                    </th>
                    <th className="w-1/3 border-b border-border p-4 text-left font-bold text-primary">{isZh ? "主神" : "Zhushen"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="flex items-center gap-2 p-4 font-medium"><Database className="h-4 w-4" /> {isZh ? "数据位置" : "Data Location"}</td>
                    <td className="p-4 text-muted-foreground">{isZh ? "远端平台或托管服务" : "Remote platform or hosted service"}</td>
                    <td className="p-4 font-bold">{isZh ? "本地机器（直接可控）" : "Local Machine (Directly Controlled)"}</td>
                  </tr>
                  <tr>
                    <td className="flex items-center gap-2 p-4 font-medium"><Server className="h-4 w-4" /> {isZh ? "部署形态" : "Deployment"}</td>
                    <td className="p-4 text-muted-foreground">{isZh ? "多服务或托管平台" : "Multiple Services or Managed Platform"}</td>
                    <td className="p-4 font-bold">{isZh ? "单二进制" : "Single Binary"}</td>
                  </tr>
                  <tr>
                    <td className="flex items-center gap-2 p-4 font-medium"><Shield className="h-4 w-4" /> {isZh ? "安全侧重点" : "Security Focus"}</td>
                    <td className="p-4 text-muted-foreground">{isZh ? "平台隔离、托管访问控制" : "Platform isolation and hosted access control"}</td>
                    <td className="p-4 font-bold">{isZh ? "传输层 TLS / 隧道 + 本机控制" : "Transport-layer TLS / Tunnel + Local Control"}</td>
                  </tr>
                  <tr>
                    <td className="flex items-center gap-2 p-4 font-medium"><Users className="h-4 w-4" /> {isZh ? "目标用户" : "Target User"}</td>
                    <td className="p-4 text-muted-foreground">{isZh ? "团队、多用户云场景" : "Teams and shared cloud usage"}</td>
                    <td className="p-4 font-bold">{isZh ? "个人、自托管开发者" : "Individuals, self-hosters"}</td>
                  </tr>
                  <tr>
                    <td className="flex items-center gap-2 p-4 font-medium"><Lock className="h-4 w-4" /> {isZh ? "信任模型" : "Trust Model"}</td>
                    <td className="p-4 text-muted-foreground">{isZh ? "更多信任平台托管边界" : "Trust the hosted platform boundary more"}</td>
                    <td className="p-4 font-bold">{isZh ? "信任自己的本地环境" : "Trust your local environment"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="mx-auto max-w-2xl space-y-8 text-center">
            <h2 className="text-3xl font-bold">{isZh ? "你该选哪一个？" : "Which one should you choose?"}</h2>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-xl border-2 border-blue-100 bg-blue-50 p-6 dark:border-blue-900 dark:bg-blue-950/20">
                <h3 className="mb-2 text-lg font-bold text-blue-700 dark:text-blue-400">
                  {isZh ? "如果你更适合托管式方案" : "Choose a hosted solution if..."}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isZh
                    ? "你需要多用户协作、统一运维，或者没有一台可以长期在线的自有机器。"
                    : "You need multi-user collaboration, centralized operations, or you don't have a machine you can keep online long-term."}
                </p>
              </div>

              <div className="rounded-xl border-2 border-primary/20 bg-primary/10 p-6">
                <h3 className="mb-2 text-lg font-bold text-primary">{isZh ? "如果你想要这些体验，选主神" : "Choose Zhushen if..."}</h3>
                <p className="text-sm text-muted-foreground">
                  {isZh
                    ? "你想要个人使用、完整的数据主权，以及尽可能简单的本地优先部署体验。"
                    : "You want personal use, full data sovereignty, and the simplest possible local-first setup."}
                </p>
              </div>
            </div>

            <Button size="lg" className="mt-8 h-14 border-2 border-border px-8 text-lg font-bold shadow-hard transition-all hover:translate-y-0.5 hover:shadow-none" asChild>
              <a href="/#installation">
                {isZh ? "开始使用主神" : "Get Started with Zhushen"} <ArrowRight className="ml-2 h-5 w-5" />
              </a>
            </Button>
          </div>
        </div>
      </section>
    </Layout>
  );
}
