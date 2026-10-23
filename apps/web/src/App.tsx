import {
  AlertOutlined,
  AreaChartOutlined,
  BarChartOutlined,
  CloudSyncOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  LineChartOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Button, Card, Col, Empty, Input, Layout, Menu, Progress, Row, Select, Space, Statistic, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import ReactECharts from "echarts-for-react";
import { useMemo, useState } from "react";
import { benchmarkNav, candidates, dates, prices, strategyNav, volumes, type Candidate } from "./demoData";

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: "dashboard", icon: <BarChartOutlined />, label: "市场仪表盘" },
  { key: "ranking", icon: <LineChartOutlined />, label: "每日研究候选" },
  { key: "stock", icon: <AreaChartOutlined />, label: "股票与指标" },
  { key: "backtest", icon: <ExperimentOutlined />, label: "历史回测" },
  { key: "data", icon: <DatabaseOutlined />, label: "数据状态" },
];

const columns: ColumnsType<Candidate> = [
  { title: "排名", dataIndex: "rank", width: 70, render: (value) => <span className="rank">{value}</span> },
  { title: "股票", width: 150, render: (_, row) => <Space direction="vertical" size={0}><strong>{row.name}</strong><span className="muted">{row.symbol} · {row.board}</span></Space> },
  { title: "规则评分", dataIndex: "score", width: 100, sorter: (a, b) => a.score - b.score, render: (value) => <strong>{value.toFixed(1)}</strong> },
  { title: "当日涨跌", dataIndex: "change", width: 100, render: (value) => <span className={value >= 0 ? "up" : "down"}>{value >= 0 ? "+" : ""}{value.toFixed(2)}%</span> },
  { title: "趋势状态", dataIndex: "trend", width: 110, render: (value) => <Tag color="blue">{value}</Tag> },
  { title: "入选依据", dataIndex: "reason", width: 220 },
  { title: "风险", dataIndex: "risk", width: 80, render: (value) => <Tag color={value.includes("高") ? "orange" : "default"}>{value}</Tag> },
];

function MetricCard({ title, value, note, icon }: { title: string; value: string; note: string; icon: React.ReactNode }) {
  return <Card className="metric-card" bordered={false}><div className="metric-icon">{icon}</div><Typography.Text type="secondary">{title}</Typography.Text><Typography.Title level={3}>{value}</Typography.Title><span className="muted">{note}</span></Card>;
}

const priceOption = {
  tooltip: { trigger: "axis" },
  grid: { left: 46, right: 20, top: 28, bottom: 34 },
  xAxis: { type: "category", data: dates, boundaryGap: false, axisLine: { lineStyle: { color: "#cfd7e6" } } },
  yAxis: { type: "value", scale: true, splitLine: { lineStyle: { color: "#edf0f5" } } },
  series: [{ name: "收盘价", type: "line", data: prices, smooth: true, symbol: "circle", symbolSize: 6, lineStyle: { width: 3, color: "#2f6bff" }, areaStyle: { color: "rgba(47,107,255,.12)" } }],
};

function Dashboard({ navigate }: { navigate: (key: string) => void }) {
  return <>
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} xl={6}><MetricCard title="已覆盖股票" value="5,326" note="合成演示股票池" icon={<DatabaseOutlined />} /></Col>
      <Col xs={24} sm={12} xl={6}><MetricCard title="数据完整度" value="99.6%" note="8 项非阻断提示" icon={<CloudSyncOutlined />} /></Col>
      <Col xs={24} sm={12} xl={6}><MetricCard title="研究候选" value="50" note="规则评分 Top 50" icon={<LineChartOutlined />} /></Col>
      <Col xs={24} sm={12} xl={6}><MetricCard title="最新任务" value="已完成" note="16:05 更新" icon={<AlertOutlined />} /></Col>
    </Row>
    <Row gutter={[16, 16]} className="section-row">
      <Col xs={24} xl={16}><Card title="今日研究候选" extra={<Button type="link" onClick={() => navigate("ranking")}>查看完整排行榜</Button>} bordered={false}><Table columns={columns.slice(0, 6)} dataSource={candidates.slice(0, 4)} pagination={false} scroll={{ x: 740 }} /></Card></Col>
      <Col xs={24} xl={8}><PipelineCard /></Col>
    </Row>
  </>;
}

function PipelineCard() {
  return <Card title="数据链路状态" bordered={false}>
    <Space direction="vertical" size={20} className="pipeline">
      {[['行情采集','完成',100,'#2f6bff'],['异常校验','8 项提示',99,'#e5a323'],['指标计算','完成',100,'#2f6bff'],['规则筛选','已发布',100,'#2f6bff']].map(([name,status,percent,color]) => <div key={String(name)}><span>{name}</span><Tag color={Number(percent) === 100 ? "success" : "warning"}>{status}</Tag><Progress percent={Number(percent)} showInfo={false} strokeColor={String(color)} /></div>)}
    </Space>
    <div className="source-meta"><span>数据来源</span><strong>合成演示数据 v1</strong><span>有效时间</span><strong>2026-10-22 15:00 CST</strong></div>
  </Card>;
}

function Ranking() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => candidates.filter((item) => `${item.name}${item.symbol}`.toLowerCase().includes(query.toLowerCase())), [query]);
  return <Card bordered={false} title="每日规则选股排行榜" extra={<Space><Select defaultValue="2026-10-22" options={[{value:"2026-10-22",label:"2026-10-22"},{value:"2026-10-21",label:"2026-10-21"}]} /><Input allowClear prefix={<SearchOutlined />} placeholder="筛选股票" value={query} onChange={(event) => setQuery(event.target.value)} /></Space>}>
    <div className="method-note"><strong>规则版本：</strong>趋势量价综合 v1.0　<span>评分用于研究排序，不代表上涨概率或投资建议。</span></div>
    <Table columns={columns} dataSource={filtered} pagination={{ pageSize: 8, hideOnSinglePage: true }} scroll={{ x: 900 }} locale={{ emptyText: <Empty description="没有匹配的股票" /> }} />
  </Card>;
}

function StockResearch() {
  const [symbol, setSymbol] = useState("600000");
  const selected = candidates.find((item) => item.symbol === symbol) ?? candidates[0];
  const indicatorOption = { tooltip: { trigger: "axis" }, grid: { left: 42, right: 16, top: 25, bottom: 30 }, xAxis: { type: "category", data: dates }, yAxis: { type: "value", splitLine: { lineStyle: { color: "#edf0f5" } } }, series: [{ name: "成交量", type: "bar", data: volumes, itemStyle: { color: "#7da2ff", borderRadius: [4,4,0,0] } }] };
  return <>
    <Card className="stock-head" bordered={false}><div><Select showSearch value={symbol} onChange={setSymbol} optionFilterProp="label" style={{ width: 260 }} options={candidates.map((item) => ({ value: item.symbol, label: `${item.symbol} ${item.name}` }))} /><Typography.Title level={3}>{selected.name} <span className="symbol">{selected.symbol}</span></Typography.Title><Space><Tag color="blue">{selected.trend}</Tag><Tag>风险 {selected.risk}</Tag><Tag color="gold">规则分 {selected.score}</Tag></Space></div><div className="quote"><strong>¥10.74</strong><span className="up">+1.26%</span><small>演示收盘价</small></div></Card>
    <Row gutter={[16,16]} className="section-row"><Col xs={24} xl={16}><Card title="价格走势 · 前复权演示" bordered={false}><ReactECharts option={priceOption} style={{ height: 330 }} /></Card></Col><Col xs={24} xl={8}><Card title="技术指标摘要" bordered={false}><div className="indicator-grid"><Statistic title="MA5" value={10.54} precision={2} /><Statistic title="MA20" value={10.21} precision={2} /><Statistic title="RSI(14)" value={61.8} precision={1} /><Statistic title="波动率(20)" value={18.4} suffix="%" precision={1} /></div><div className="diagnosis"><strong>规则诊断</strong><p>短期均线位于中期均线上方，量能温和放大，趋势强度改善。当前只提供可解释规则观察，不调用 AI 生成买卖结论。</p></div></Card></Col></Row>
    <Card title="成交量变化" bordered={false} className="section-row"><ReactECharts option={indicatorOption} style={{ height: 250 }} /></Card>
  </>;
}

function Backtest() {
  const option = { tooltip: { trigger: "axis" }, legend: { data: ["规则策略", "沪深300基准"] }, grid: { left: 50, right: 20, top: 45, bottom: 34 }, xAxis: { type: "category", data: dates, boundaryGap: false }, yAxis: { type: "value", min: .98, splitLine: { lineStyle: { color: "#edf0f5" } } }, series: [{ name: "规则策略", type: "line", data: strategyNav, smooth: true, lineStyle: { width: 3, color: "#2f6bff" } }, { name: "沪深300基准", type: "line", data: benchmarkNav, smooth: true, lineStyle: { width: 2, color: "#98a5b8", type: "dashed" } }] };
  return <><Row gutter={[16,16]}><Col xs={12} lg={6}><Card bordered={false}><Statistic title="区间收益" value={9.7} precision={1} suffix="%" valueStyle={{ color: "#cf3c35" }} /></Card></Col><Col xs={12} lg={6}><Card bordered={false}><Statistic title="基准收益" value={4.4} precision={1} suffix="%" /></Card></Col><Col xs={12} lg={6}><Card bordered={false}><Statistic title="最大回撤" value={-1.2} precision={1} suffix="%" /></Card></Col><Col xs={12} lg={6}><Card bordered={false}><Statistic title="模拟交易" value={28} suffix="笔" /></Card></Col></Row><Card title="策略净值与基准" bordered={false} className="section-row" extra={<Tag color="purple">固定演示回测</Tag>}><ReactECharts option={option} style={{ height: 360 }} /><div className="method-note">本结果为合成数据演示，不代表真实收益。正式引擎将计入 T+1、停牌、涨跌停、佣金、印花税与滑点。</div></Card></>;
}

function DataStatus() {
  const rows = [
    { key: 1, dataset: "股票基础资料", status: "正常", rows: "5,326", time: "15:42", source: "演示 Provider" },
    { key: 2, dataset: "交易日历", status: "正常", rows: "5,846", time: "15:43", source: "演示 Provider" },
    { key: 3, dataset: "日 K 行情", status: "正常", rows: "12,450,812", time: "15:56", source: "合成快照 v1" },
    { key: 4, dataset: "复权因子", status: "正常", rows: "86,231", time: "15:58", source: "合成快照 v1" },
    { key: 5, dataset: "技术指标", status: "8 项提示", rows: "18,743,220", time: "16:03", source: "因子集 v1" },
    { key: 6, dataset: "规则筛选", status: "已发布", rows: "50", time: "16:05", source: "策略 v1.0" },
  ];
  return <Row gutter={[16,16]}><Col xs={24} xl={16}><Card title="数据更新记录" bordered={false}><Table dataSource={rows} pagination={false} columns={[{title:"数据集",dataIndex:"dataset"},{title:"状态",dataIndex:"status",render:(value)=><Tag color={value === "8 项提示" ? "warning" : "success"}>{value}</Tag>},{title:"记录数",dataIndex:"rows"},{title:"更新时间",dataIndex:"time"},{title:"来源/版本",dataIndex:"source"}]} scroll={{x:700}} /></Card></Col><Col xs={24} xl={8}><PipelineCard /><Card title="质量说明" bordered={false} className="section-row"><p>8 项提示均为上市时间不足指标窗口的演示记录，不影响已发布榜单。</p><p className="muted">严重异常会阻断当日发布，并继续展示最近一次成功快照。</p></Card></Col></Row>;
}

const titles: Record<string, [string,string]> = { dashboard: ["市场仪表盘","每日数据与研究任务总览"], ranking: ["每日研究候选","可解释规则评分与历史快照"], stock: ["股票与技术指标","价格、量能与指标证据"], backtest: ["历史回测","策略净值、风险和交易约束"], data: ["数据更新状态","来源、时点、质量与处理进度"] };

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const content = page === "dashboard" ? <Dashboard navigate={setPage} /> : page === "ranking" ? <Ranking /> : page === "stock" ? <StockResearch /> : page === "backtest" ? <Backtest /> : <DataStatus />;
  return <Layout className="shell">
    <Sider className="sider" width={232} breakpoint="lg" collapsedWidth="0" trigger={null} onBreakpoint={(broken) => setMobileOpen(!broken)} collapsed={!mobileOpen}>
      <div className="brand"><div className="brand-mark">研</div><div><strong>智研 A 股</strong><span>量化研究终端</span></div></div>
      <Menu theme="dark" mode="inline" selectedKeys={[page]} onClick={({key}) => setPage(key)} items={menuItems} />
      <div className="sider-note">演示研究版本<br />不构成投资建议</div>
    </Sider>
    <Layout><Header className="header"><div><Typography.Title level={4}>{titles[page][0]}</Typography.Title><Typography.Text type="secondary">{titles[page][1]} · 2026-10-22</Typography.Text></div><Button className="mobile-menu" onClick={() => setMobileOpen((value) => !value)}>菜单</Button><Input prefix={<SearchOutlined />} placeholder="搜索股票代码、名称或拼音" className="search" onPressEnter={() => setPage("stock")} /></Header>
      <Content className="content"><div className="notice"><span><CloudSyncOutlined /> 合成演示数据</span>所有行情、评分和回测均为界面演示，不代表真实证券表现。</div>{content}</Content>
    </Layout>
  </Layout>;
}

