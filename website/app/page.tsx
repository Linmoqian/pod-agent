import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  Database,
  FileCheck2,
  GitBranch,
  LockKeyhole,
  MessageSquare,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Workflow
} from "lucide-react";

import { ProductPreview } from "@/components/ProductPreview";

import styles from "./home.module.css";

const FLOW_STEPS = [
  {
    number: "01",
    title: "对话",
    description: "把研究问题说清楚，保留上下文与决策依据。",
    icon: MessageSquare
  },
  {
    number: "02",
    title: "数据",
    description: "导入表格，先检查字段、质量与当前项目边界。",
    icon: Database
  },
  {
    number: "03",
    title: "TaskPlan",
    description: "Agent 提出可审阅的步骤，确认后才进入执行。",
    icon: Workflow
  },
  {
    number: "04",
    title: "Artifact",
    description: "结果和来源留下来，让下一次判断有迹可循。",
    icon: FileCheck2
  }
];

const CAPABILITIES = [
  {
    label: "LOCAL FIRST",
    title: "研究数据留在工作区",
    description:
      "Rust/Tauri 负责正式的数据边界，来源文件进入受管目录并按 SHA-256 去重；SQLite 保存项目、会话和执行事实。",
    icon: LockKeyhole,
    tone: "green"
  },
  {
    label: "CONTROLLED AGENT",
    title: "每一步都可以被确认",
    description:
      "Agent 通过受控的 TaskPlan 连接研究意图与执行动作。计划先展示，用户确认后才启动分析工作流。",
    icon: ShieldCheck,
    tone: "blue"
  },
  {
    label: "TRACEABLE OUTPUT",
    title: "结果不是一次性回答",
    description:
      "Execution、Artifact 与 Lineage 把输入、计划和产物串在一起，便于复盘方法，也便于继续追问。",
    icon: GitBranch,
    tone: "gold"
  },
  {
    label: "IMAGE WORKFLOW",
    title: "把图像任务放回同一条链路",
    description:
      "本地图像识别能力通过 Rust 与受控 YOLO 工具接入；模型能力以当前登记的本地权重和任务边界为准。",
    icon: ScanLine,
    tone: "mint"
  }
];

export default function HomePage() {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>
              <span className={styles.eyebrowDot} />
              <span>lian@lab · 本地科研工作空间</span>
              <span className={styles.eyebrowLine} />
              <span className={styles.eyebrowMeta}>POD / 01</span>
            </div>
            <h1>
              智慧育种，
              <span>从一次对话开始</span>
            </h1>
            <p className={styles.heroDescription}>
              比较品种性状、整理育种台账，并让田间数据成为清晰的下一步。
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryButton} href="/docs/quickstart">
                阅读快速开始
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link className={styles.secondaryButton} href="/docs">
                <BookIcon />
                查看开发文档
              </Link>
            </div>
            <div className={styles.heroFacts} aria-label="产品定位">
              <span>
                <Check size={14} aria-hidden="true" />
                本地优先
              </span>
              <span>
                <Check size={14} aria-hidden="true" />
                计划可确认
              </span>
              <span>
                <Check size={14} aria-hidden="true" />
                结果可追溯
              </span>
            </div>
          </div>

          <div className={styles.heroVisual}>
            <div className={styles.visualLabel}>
              <span>WORKSPACE / LIVE PREVIEW</span>
              <span>NO REMOTE DATA</span>
            </div>
            <ProductPreview />
            <div className={styles.mascotNote}>
              <Image
                src="/brand/agent-mascot.png"
                alt="Pod Agent 蓝色吉祥物"
                width={82}
                height={82}
              />
              <div>
                <strong>Agent 有边界，研究更安心</strong>
                <span>先理解，再计划；先确认，再执行。</span>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.heroBaseline}>
          <span>SOYBEAN BREEDING / DATA / METHOD</span>
          <span>SCROLL TO EXPLORE ↓</span>
        </div>
      </section>

      <section className={styles.introSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIndex}>01 / WHY POD AGENT</span>
          <h2>让科研问题，拥有一条可以回看的路径。</h2>
          <p>
            Pod Agent 面向大豆育种场景，把对话、数据导入、受控分析和结果整理放进同一个本地工作区。
            它不替你做未经确认的结论，而是帮助你把下一步变得具体。
          </p>
        </div>
        <div className={styles.introAside}>
          <span className={styles.asideMark}>↳</span>
          <p>
            从一个问题开始，沿着数据和计划走到结果；每个关键节点，都能找到它为什么发生。
          </p>
        </div>
      </section>

      <section className={styles.flowSection} id="flow">
        <div className={styles.sectionHeaderRow}>
          <div>
            <span className={styles.sectionIndex}>02 / RESEARCH LOOP</span>
            <h2>从问题到结果，四个清晰的动作。</h2>
          </div>
          <span className={styles.sectionSideNote}>A SMALL LOOP WITH A LONG MEMORY</span>
        </div>
        <div className={styles.flowGrid}>
          {FLOW_STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <div className={styles.flowCard} key={step.number}>
                <div className={styles.flowCardTop}>
                  <span>{step.number}</span>
                  <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
                </div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                {index < FLOW_STEPS.length - 1 ? (
                  <span className={styles.flowArrow} aria-hidden="true">
                    →
                  </span>
                ) : (
                  <span className={styles.flowArrow} aria-hidden="true">
                    ↗
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.capabilitySection} id="capabilities">
        <div className={styles.sectionHeaderRow}>
          <div>
            <span className={styles.sectionIndex}>03 / CAPABILITIES</span>
            <h2>能力可以扩展，边界必须清楚。</h2>
          </div>
          <p className={styles.sectionLead}>
            从数据事实到 Agent 交互，每一层都有自己的职责。<br />
            这让复杂工作流变得更容易解释和维护。
          </p>
        </div>
        <div className={styles.capabilityGrid}>
          {CAPABILITIES.map((capability) => {
            const Icon = capability.icon;
            return (
              <article
                className={`${styles.capabilityCard} ${styles[capability.tone]}`}
                key={capability.title}
              >
                <div className={styles.capabilityIcon}>
                  <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
                </div>
                <span className={styles.capabilityLabel}>{capability.label}</span>
                <h3>{capability.title}</h3>
                <p>{capability.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.detailsSection}>
        <div className={styles.detailsVisual}>
          <div className={styles.detailsStamp}>
            <BarChart3 size={20} aria-hidden="true" />
            <span>FIELD NOTE / 02</span>
          </div>
          <div className={styles.dataCard}>
            <div className={styles.dataCardHeader}>
              <span>DATASET / 2026 SPRING</span>
              <span className={styles.readyTag}>READY</span>
            </div>
            <div className={styles.dataBars} aria-hidden="true">
              <span style={{ height: "40%" }} />
              <span style={{ height: "64%" }} />
              <span style={{ height: "53%" }} />
              <span style={{ height: "78%" }} />
              <span style={{ height: "68%" }} />
              <span style={{ height: "89%" }} />
              <span style={{ height: "74%" }} />
              <span style={{ height: "94%" }} />
            </div>
            <div className={styles.dataAxis}>
              <span>株高</span>
              <span>百粒重</span>
              <span>缺失值检查</span>
            </div>
          </div>
          <span className={styles.detailsCaption}>数据质量先于结论</span>
        </div>
        <div className={styles.detailsCopy}>
          <span className={styles.sectionIndex}>04 / A BETTER NEXT STEP</span>
          <h2>研究工作不止是“得到一个答案”。</h2>
          <p>
            一个可靠的下一步，应该知道自己从哪里来、做过什么、还缺什么。Pod Agent 把这些上下文留在项目里，
            让你可以围绕真实数据继续提问，而不是重新拼接一次背景。
          </p>
          <div className={styles.detailList}>
            <div>
              <span className={styles.detailNumber}>A</span>
              <span>
                <strong>支持常用表格入口</strong>
                CSV、TSV、TXT、XLSX 都先经过字段推断与质量检查。
              </span>
            </div>
            <div>
              <span className={styles.detailNumber}>B</span>
              <span>
                <strong>由用户掌握执行节奏</strong>
                TaskPlan 先审阅，确认之后才启动真实工作流。
              </span>
            </div>
            <div>
              <span className={styles.detailNumber}>C</span>
              <span>
                <strong>每个产物都能继续追问</strong>
                Execution、Artifact 和 Lineage 保留结果与来源关系。
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.docsCta}>
        <div className={styles.ctaMascot}>
          <Image
            src="/brand/agent-mascot.png"
            alt=""
            width={128}
            height={128}
          />
        </div>
        <div>
          <span className={styles.sectionIndex}>FOR BUILDERS</span>
          <h2>想了解它是怎样工作的？</h2>
          <p>从安装、架构到贡献约定，开发文档把当前实现和边界写在一起。</p>
        </div>
        <Link className={styles.ctaButton} href="/docs">
          进入开发文档
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
    </>
  );
}

function BookIcon() {
  return <Sparkles size={15} aria-hidden="true" />;
}
