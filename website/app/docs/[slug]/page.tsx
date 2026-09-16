import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocsShell } from "@/components/DocsShell";
import { docEntries, findDoc } from "@/content/docs/registry";

import styles from "../docs.module.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return docEntries.map((entry) => ({ slug: entry.slug }));
}

type DocPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: DocPageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = findDoc(slug);

  if (!entry) {
    return {};
  }

  return {
    title: entry.title,
    description: entry.description
  };
}

export default async function DocPage({ params }: DocPageProps) {
  const { slug } = await params;
  const entry = findDoc(slug);

  if (!entry) {
    notFound();
  }

  const Content = entry.Component;

  return (
    <DocsShell
      currentSlug={entry.slug}
      eyebrow={entry.kicker}
      title={entry.title}
      description={entry.description}
    >
      <article className={styles.docArticle}>
        <Content />
      </article>
    </DocsShell>
  );
}
