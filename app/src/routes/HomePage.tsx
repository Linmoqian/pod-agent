import { Typography } from "antd";
import { Leaf, MessageSquareText, Tractor } from "lucide-react";
import MarkdownContent from "../features/chat/components/MarkdownContent";
import styles from "./HomePage.module.css";

const { Title, Paragraph } = Typography;

// 占位演示内容：验证 GFM 表格与代码高亮链路，待聊天功能落地后替换为真实首页
const SAMPLE_MARKDOWN = `### 大豆育种 Agent

支持 **品种咨询**、*田间管理* 与育种数据问答。

| 性状 | 示例品种 | 备注 |
| --- | --- | --- |
| 蛋白含量 | 中黄 13 | 高蛋白 |
| 产量 | 合丰 50 | 适应性强 |

\`\`\`python
# 示例：查询品种性状
def query_trait(variety: str, trait: str) -> dict: ...
\`\`\`
`;

function HomePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Leaf size={28} aria-hidden />
        <Title level={3} style={{ margin: 0 }}>
          Pod Agent
        </Title>
      </header>

      <Paragraph type="secondary">
        <MessageSquareText size={14} aria-hidden />{" "}
        大豆育种智能体 · 依赖链路已就绪
        <Tractor size={14} aria-hidden style={{ marginLeft: 8 }} />
      </Paragraph>

      <MarkdownContent content={SAMPLE_MARKDOWN} />
    </main>
  );
}

export default HomePage;
