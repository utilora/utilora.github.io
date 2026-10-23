import {
  AlertOutlined,
  BarChartOutlined,
  CloudSyncOutlined,
  DatabaseOutlined,
  LineChartOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Card, Col, Input, Layout, Menu, Progress, Row, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";

const { Header, Sider, Content } = Layout;

type Candidate = {
  key: string;
  rank: number;
  symbol: string;
  name: string;
  score: number;
  trend: string;
  reason: string;
};

const candidates: Candidate[] = [
  { key: "1", rank: 1, symbol: "600000", name: "演示股份 A", score: 86.4, trend: "趋势增强", reason: "均线多头 · 量能温和" },
  { key: "2", rank: 2, symbol: "000001", name: "演示股份 B", score: 82.7, trend: "强于基准", reason: "RSI 中性 · 波动收敛" },
  { key: "3", rank: 3, symbol: "300001", name: "演示股份 C", score: 79.2, trend: "趋势修复", reason: "MACD 改善 · 成交活跃" },
  { key: "4", rank: 4, symbol: "688001", name: "演示股份 D", score: 76.8, trend: "震荡上行", reason: "突破短均线 · 风险适中" },
];

const columns: ColumnsType<Candidate> = [
  { title: "排名", dataIndex: "rank", width: 72, render: (value) => <span className="rank">{value}</span> },
  { title: "股票", render: (_, row) => <Space direction="vertical" size={0}><strong>{row.name}</strong><span className="muted">{row.symbol}</span></Space> },
  { title: "规则评分", dataIndex: "score", render: (value) => <strong>{value.toFixed(1)}</strong> },
  { title: "趋势状态", dataIndex: "trend", render: (value) => <Tag color="blue">{value}</Tag> },
  { title: "入选依据", dataIndex: "reason", responsive: ["md"] },
];

function MetricCard({ title, value, note, icon }: { title: string; value: string; note: string; icon: React.ReactNode }) {
  return <Card className="metric-card" bordered={false}><div className="metric-icon">{icon}</div><Typography.Text type="secondary">{title}</Typography.Text><Typography.Title level={3}>{value}</Typography.Title><span className="muted">{note}</span></Card>;
}

export default function App() {
  return (
    <Layout className="shell">
      <Sider className="sider" width={232} breakpoint="lg" collapsedWidth="0">
        <div className="brand"><div className="brand-mark">研</div><div><strong>智研 A 股</strong><span>量化研究终端</span></div></div>
        <Menu theme="dark" mode="inline" defaultSelectedKeys={["dashboard"]} items={[
          { key: "dashboard", icon: <BarChartOutlined />, label: "市场仪表盘" },
          { key: "ranking", icon: <LineChartOutlined />, label: "每日研究候选" },
          { key: "stocks", icon: <SearchOutlined />, label: "股票与指标" },
          { key: "backtest", icon: <AlertOutlined />, label: "历史回测" },
          { key: "data", icon: <DatabaseOutlined />, label: "数据状态" },
        ]} />
        <div className="sider-note">内部研究版本<br />不构成投资建议</div>
      </Sider>
      <Layout>
        <Header className="header"><div><Typography.Title level={4}>市场仪表盘</Typography.Title><Typography.Text type="secondary">2026-10-22 · 收盘后研究快照</Typography.Text></div><Input prefix={<SearchOutlined />} placeholder="搜索股票代码、名称或拼音" className="search" /></Header>
        <Content className="content">
          <div className="notice"><span><CloudSyncOutlined /> 演示数据模式</span>当前页面全部为合成样例，不代表真实证券表现。</div>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} xl={6}><MetricCard title="已覆盖股票" value="5,326" note="演示股票池" icon={<DatabaseOutlined />} /></Col>
            <Col xs={24} sm={12} xl={6}><MetricCard title="数据完整度" value="99.6%" note="8 项待复核" icon={<CloudSyncOutlined />} /></Col>
            <Col xs={24} sm={12} xl={6}><MetricCard title="研究候选" value="50" note="规则评分 Top 50" icon={<LineChartOutlined />} /></Col>
            <Col xs={24} sm={12} xl={6}><MetricCard title="最新任务" value="已完成" note="16:05 更新" icon={<AlertOutlined />} /></Col>
          </Row>
          <Row gutter={[16, 16]} className="section-row">
            <Col xs={24} xl={16}>
              <Card title="今日研究候选" extra={<Typography.Link>查看完整排行榜</Typography.Link>} bordered={false}>
                <Table columns={columns} dataSource={candidates} pagination={false} size="middle" scroll={{ x: 620 }} />
              </Card>
            </Col>
            <Col xs={24} xl={8}>
              <Card title="数据链路状态" bordered={false}>
                <Space direction="vertical" size={22} className="pipeline">
                  <div><span>行情采集</span><Tag color="success">完成</Tag><Progress percent={100} showInfo={false} /></div>
                  <div><span>异常校验</span><Tag color="warning">8 项提示</Tag><Progress percent={99} showInfo={false} strokeColor="#e5a323" /></div>
                  <div><span>指标计算</span><Tag color="success">完成</Tag><Progress percent={100} showInfo={false} /></div>
                  <div><span>规则筛选</span><Tag color="success">已发布</Tag><Progress percent={100} showInfo={false} /></div>
                </Space>
                <div className="source-meta"><span>数据来源</span><strong>合成演示数据 v1</strong><span>有效时间</span><strong>2026-10-22 15:00 CST</strong></div>
              </Card>
            </Col>
          </Row>
        </Content>
      </Layout>
    </Layout>
  );
}

