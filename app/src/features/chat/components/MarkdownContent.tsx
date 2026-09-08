import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import styles from "./MarkdownContent.module.css";

type MarkdownContentProps = {
  content: string;
};

function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <section className={styles.content}>
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content}
      </Markdown>
    </section>
  );
}

export default MarkdownContent;
