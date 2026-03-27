function toneClass(tone) {
  return {
    positive: "positive",
    neutral: "neutral",
    warning: "warning",
    danger: "danger",
  }[tone] || "neutral";
}

function summaryLabel(score) {
  if (score >= 80) return "强势";
  if (score >= 60) return "偏强";
  if (score >= 40) return "中性";
  if (score >= 20) return "偏弱";
  return "风险";
}

export default function MarketRiskGauge({ risk }) {
  const score = Math.max(0, Math.min(100, Number(risk?.pointerValue ?? risk?.score ?? 50)));
  const rotation = -90 + (score / 100) * 180;
  const factors = Array.isArray(risk?.factors) ? risk.factors : [];
  const buyFactor = factors.find((factor) => factor.key === "limits");
  const neutralFactor = factors.find((factor) => factor.key === "ma20");
  const sellFactor = factors.find((factor) => factor.key === "breadth");

  return (
    <div className="summary-pill summary-pill-gauge">
      <div className="summary-gauge-head">
        <span>大盘风控</span>
        <strong>{summaryLabel(score)}</strong>
      </div>

      <div className="summary-gauge-shell">
        <div className="summary-gauge-scale top">中性</div>
        <div className="summary-gauge-scale left">卖出</div>
        <div className="summary-gauge-scale right">买入</div>
        <div className="summary-gauge-scale far-left">强卖</div>
        <div className="summary-gauge-scale far-right">强买</div>

        <div className="summary-gauge">
          <div className="summary-gauge-track" />
          <div className="summary-gauge-danger-band" />
          <div className="summary-gauge-needle" style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }} />
          <div className="summary-gauge-center" />
        </div>
      </div>

      <div className={`summary-gauge-value ${toneClass(risk?.tone)}`}>{risk?.label || "中性"}</div>

      <div className="summary-gauge-stats">
        <div>
          <span>卖出</span>
          <strong>{sellFactor?.displayValue || "--"}</strong>
        </div>
        <div>
          <span>中性</span>
          <strong>{neutralFactor?.displayValue || "--"}</strong>
        </div>
        <div>
          <span>买入</span>
          <strong>{buyFactor?.displayValue || "--"}</strong>
        </div>
      </div>
    </div>
  );
}
