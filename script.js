
let FULL_DATA = null;
let MATRIX_LOADED = false;

// Variables for Matrix Logic
const THEMES = [
    "Infrastructure & Facilities",
    "Academic Quality & Curriculum",
    "Parent–Teacher Communication",
    "Student Experience & Wellbeing",
    "Teacher Quality & Stability",
    "School Leadership & Community",
    "Resources & Capacity"
];
let SCHOOLS_LIST = [];
let CURRENT_SCHOOL_IDX = -1;
let CURRENT_THEME_IDX = -1;
let IS_MODAL_OPEN = false;

window.addEventListener('DOMContentLoaded', () => {

    // TAB LOGIC
    const tabs = document.querySelectorAll('.tab-btn');
    const sections = document.querySelectorAll('.view-section');

    function switchTab(targetId) {
        tabs.forEach(t => {
            if (t.dataset.target === targetId) t.classList.add('active');
            else t.classList.remove('active');
        });

        sections.forEach(s => {
            if (s.id === targetId) s.classList.add('active');
            else s.classList.remove('active');
        });

        // Trigger resize for D3 if needed
        if (targetId === 'view-connect' && FULL_DATA) {
            setTimeout(() => initRadial(FULL_DATA.radial_graph), 50);
        }
        // Trigger Matrix Load
        if (targetId === 'view-matrix' && !MATRIX_LOADED) {
            initRealMatrix();
            MATRIX_LOADED = true;
        }
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            switchTab(e.target.dataset.target);
        });
    });

    // DATA LOADING
    fetch('full_dashboard_data.json')
        .then(res => res.json())
        .then(data => {
            FULL_DATA = data;
            try { if (data.exec_summary) initStory(data); } catch (e) { }

            // Handle default active tab after data is ready
            const activeSection = document.querySelector('.view-section.active');
            if (activeSection && activeSection.id === 'view-matrix' && !MATRIX_LOADED) {
                initRealMatrix();
                MATRIX_LOADED = true;
            }
        })
        .catch(err => console.error(err));

    // Keyboard listeners for Matrix
    document.addEventListener("keydown", (e) => {
        const matrixView = document.getElementById("view-matrix");
        if (!matrixView || !matrixView.classList.contains("active")) return;

        if (e.key === "Escape") {
            if (IS_MODAL_OPEN) closeModal();
            return;
        }

        // Logic now allows arrow keys even if IS_MODAL_OPEN is true
        let newSIdx = CURRENT_SCHOOL_IDX;
        let newTIdx = CURRENT_THEME_IDX;

        if (e.key === "ArrowUp") newSIdx--;
        if (e.key === "ArrowDown") newSIdx++;
        if (e.key === "ArrowLeft") newTIdx--;
        if (e.key === "ArrowRight") newTIdx++;

        if (newSIdx < 0) newSIdx = 0;
        if (newSIdx >= SCHOOLS_LIST.length) newSIdx = SCHOOLS_LIST.length - 1;
        if (newTIdx < 0) newTIdx = 0;
        if (newTIdx >= THEMES.length) newTIdx = THEMES.length - 1;

        if (newSIdx !== CURRENT_SCHOOL_IDX || newTIdx !== CURRENT_THEME_IDX) {
            e.preventDefault();
            // Pass IS_MODAL_OPEN as the flag. If true -> update modal. If false -> just select.
            selectAndOpen(newSIdx, newTIdx, IS_MODAL_OPEN);

            // Optional: Ensure the background table scrolls to keep context
            const cell = document.getElementById(`cell-${newSIdx}-${newTIdx}`);
            if (cell) cell.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
    });
});

function initStory(data) {
    const summary = data.exec_summary;
    const insights = summary.insights;
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    setText('kpi-total', summary.kpi.total.toLocaleString());
    setText('kpi-score', Math.round(summary.kpi.net_score) + '%');
    setText('kpi-risk', summary.kpi.neg_pct + '%');

    if (insights) {
        setText('stability-stat-1', insights.stability.neg_pct_of_topic + '%');
        setText('value-stat-1', insights.resources.neg_pct_of_topic + '%');

        // Verbatim update
        if (insights.stability.example_verbatim) {
            setText('stability-verbatim-text', '"' + insights.stability.example_verbatim.text + '"');
            setText('stability-verbatim-school', insights.stability.example_verbatim.school);
            setText('stability-verbatim-city', insights.stability.example_verbatim.city);
        }
    }

    const container = document.getElementById('theme-bars');
    if (container && data.themes) {
        container.innerHTML = "";
        const sortedThemes = Object.keys(data.themes).sort((a, b) => {
            return data.themes[a].score_pct - data.themes[b].score_pct;
        });

        sortedThemes.forEach(t => {
            const tData = data.themes[t];
            const scorePct = tData.score_pct;
            const total = tData.sentiment_breakdown.positive + tData.sentiment_breakdown.neutral + tData.sentiment_breakdown.negative;
            const negShare = total > 0 ? (tData.sentiment_breakdown.negative / total) * 100 : 0;
            const row = document.createElement('div');
            row.style.marginBottom = "12px";
            row.innerHTML = `<div style="font-size:11px; font-weight:600; display:flex; justify-content:space-between; margin-bottom:4px; color:#334155;"><span>${t}</span><span style="color:#64748b">${scorePct > 0 ? '+' : ''}${Math.round(scorePct)}%</span></div><div style="height:6px; background:#f1f5f9; border-radius:3px; overflow:hidden;"><div style="height:100%; width:${Math.abs(scorePct)}%; background:${scorePct < 0 ? '#ef4444' : '#10b981'}; margin-left: ${scorePct < 0 ? '0' : '0'};"></div></div>`;
            container.appendChild(row);
        });
    }

    // Init Chart
    if (insights.drivers) initDriverChart(insights.drivers);
}

let driverChartInstance = null;
function initDriverChart(drivers) {
    const ctx = document.getElementById('driverChart');
    if (!ctx) return;

    if (driverChartInstance) driverChartInstance.destroy();

    // Format data
    const labels = drivers.map(d => d.phrase);
    const values = drivers.map(d => d.count);

    driverChartInstance = new Chart(ctx, {
        type: 'bar',
        indexAxis: 'y', // Horizontal
        data: {
            labels: labels,
            datasets: [{
                label: 'Negative Mention Frequency',
                data: values,
                backgroundColor: 'rgba(239, 68, 68, 0.7)',
                borderColor: '#ef4444',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return ` ${context.raw} citations`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    title: { display: true, text: 'Frequency in Negative Reviews' }
                },
                y: {
                    grid: { display: false },
                    ticks: { font: { weight: 'bold' } }
                }
            }
        }
    });
}

function initRadial(data) {
    const svgElem = document.getElementById("radial-viz");
    if (!svgElem) return;
    svgElem.innerHTML = "";

    // Full Screen Logic: Get container dims
    const parent = svgElem.parentElement;
    const width = parent.clientWidth;
    const height = parent.clientHeight;

    svgElem.setAttribute("width", width);
    svgElem.setAttribute("height", height);
    svgElem.setAttribute("viewBox", `0 0 ${width} ${height}`);

    // Center is absolute center now
    const center = { x: width / 2, y: height / 2 };

    // Geometry Constraints
    // We need space for text on sides.
    // Radius should be smaller than half the min dimension
    const minDim = Math.min(width, height);
    const innerRadius = minDim * 0.22; // Tighten core
    const outerRadius = minDim * 0.32; // Bring nodes closer to center to leave room for text labels

    const svg = d3.select(svgElem);
    const g = svg.append("g").attr("transform", `translate(${center.x},${center.y})`);

    const nodes = data.nodes;
    const links = data.links;
    const themes = nodes.filter(n => n.group === 'theme');
    const schools = nodes.filter(n => n.group === 'school').sort((a, b) => b.net_sentiment - a.net_sentiment);

    const countT = themes.length;
    themes.forEach((n, i) => {
        // Right Hemisphere: -50 to +50 degrees
        const pct = i / (countT - 1);
        n.angle = -Math.PI / 3.5 + (pct * Math.PI / 1.75);
    });

    // Schools: Left Hemisphere
    // Reduce spread slightly to avoid hitting top/bottom edges with text
    // 120 deg (2.09 rad) to 240 deg (4.18 rad)
    const countS = schools.length;
    const startAngle = Math.PI / 2 + 0.5;
    const endAngle = 3 * Math.PI / 2 - 0.5;

    schools.forEach((n, i) => {
        const pct = i / (countS - 1);
        n.angle = startAngle + (pct * (endAngle - startAngle));
    });

    g.selectAll(".link").data(links).enter().append("path").attr("class", "link").attr("d", d => {
        const sn = nodes.find(n => n.id === d.source);
        const tn = nodes.find(n => n.id === d.target);
        if (!sn || !tn) return null;
        const sx = outerRadius * Math.cos(sn.angle);
        const sy = outerRadius * Math.sin(sn.angle);
        const tx = outerRadius * Math.cos(tn.angle);
        const ty = outerRadius * Math.sin(tn.angle);
        const path = d3.path();
        path.moveTo(sx, sy);
        path.quadraticCurveTo(0, 0, tx, ty);
        return path.toString();
    })
        .style("fill", "none").style("stroke-width", d => Math.max(0.5, Math.log(d.value + 1) * 0.6))
        .style("stroke", d => d.sentiment > 0.2 ? "#10b981" : (d.sentiment < -0.2 ? "#ef4444" : "#cbd5e1"))
        .style("opacity", d => d.sentiment === 0 ? 0.2 : 0.5);

    const nodeGroups = g.selectAll(".node").data(nodes).enter().append("g").attr("transform", d => `translate(${outerRadius * Math.cos(d.angle)},${outerRadius * Math.sin(d.angle)})`);
    nodeGroups.append("circle").attr("r", d => d.group === 'theme' ? 5 : 3).style("fill", d => d.group === 'theme' ? "#0f172a" : (d.net_sentiment > 0.1 ? "#10b981" : (d.net_sentiment < -0.1 ? "#ef4444" : "#94a3b8")));
    nodeGroups.append("text").text(d => d.id).style("font-size", d => d.group === 'theme' ? "12px" : "10px").style("font-weight", d => d.group === 'theme' ? "700" : "400").style("fill", "#334155").attr("dy", "0.32em").attr("transform", d => {
        const deg = d.angle * 180 / Math.PI;
        if (Math.abs(deg) > 90) return `rotate(${deg - 180}) translate(-10, 0)`;
        return `rotate(${deg}) translate(10, 0)`;
    })
        .style("text-anchor", d => Math.abs(d.angle * 180 / Math.PI) > 90 ? "end" : "start")
        .on("mouseover", function (event, d) {
            d3.select(this).style("fill", "#000").style("font-weight", "700");
            g.selectAll(".link").style("opacity", 0.05);
            g.selectAll(".link").filter(l => l.source === d.id || l.target === d.id).style("opacity", 1).style("stroke-width", 2).raise();
        })
        .on("mouseout", function (event, d) {
            d3.select(this).style("fill", "#334155").style("font-weight", d.group === 'theme' ? "700" : "400");
            g.selectAll(".link").style("opacity", l => l.sentiment === 0 ? 0.2 : 0.5).style("stroke-width", null);
        });
}

// --- REAL MATRIX LOGIC (Ported from index.html) ---

function getSentimentColor(avgVal) {
    if (avgVal > 1.0) return "fill-very-green";
    if (avgVal > 0.05) return "fill-green";
    if (avgVal < -1.0) return "fill-very-red";
    if (avgVal < -0.05) return "fill-red";
    return "fill-yellow";
}

// Sort State
let CURRENT_SORT = { col: 'name', dir: 'asc' };

function initRealMatrix() {
    if (!FULL_DATA || !FULL_DATA.matrix) return;
    SCHOOLS_LIST = FULL_DATA.matrix;

    const summaryContainer = d3.select("#summary-list");
    if (summaryContainer.node()) {
        summaryContainer.selectAll("*").remove();

        const totalSchools = SCHOOLS_LIST.length;
        // Determine max volume for relative bars
        let maxVol = 0;
        THEMES.forEach(theme => {
            if (FULL_DATA.themes[theme] && FULL_DATA.themes[theme].volume > maxVol) {
                maxVol = FULL_DATA.themes[theme].volume;
            }
        });

        THEMES.forEach((theme, i) => {
            const stats = FULL_DATA.themes[theme];
            if (!stats) return;
            const barColor = getSentimentColor(stats.score);

            // Use School Count for coverage
            const sCount = stats.school_count || 0;
            const pct = (sCount / totalSchools) * 100;

            const row = summaryContainer.append("div").attr("class", "summary-row");
            row.append("div").attr("class", "s-idx").text(i + 1);
            row.append("div").attr("class", "s-name").text(theme).attr("title", theme);
            const barCont = row.append("div").attr("class", "s-bar-container");
            barCont.append("div").attr("class", "progress-bar-bg").append("div").attr("class", `progress-bar-fill ${barColor}`).style("width", `${pct}%`);

            // Display Coverage
            row.append("div").attr("class", "s-count").text(`${sCount} / ${totalSchools}`);
        });
    }

    // Default Sort: Alphabetical
    sortMatrix('name', 'asc');
    renderMatrixTable();
}

function handleSort(colKey) {
    if (CURRENT_SORT.col === colKey) {
        CURRENT_SORT.dir = CURRENT_SORT.dir === 'asc' ? 'desc' : 'asc';
    } else {
        CURRENT_SORT.col = colKey;
        if (colKey === 'name' || colKey === 'city') CURRENT_SORT.dir = 'asc';
        else CURRENT_SORT.dir = 'desc';
    }
    sortMatrix(CURRENT_SORT.col, CURRENT_SORT.dir);
    renderMatrixTable();
}

function sortMatrix(col, dir) {
    SCHOOLS_LIST.sort((a, b) => {
        let valA, valB;

        if (col === 'name') { valA = a.name; valB = b.name; }
        else if (col === 'city') { valA = a.city || ""; valB = b.city || ""; }
        else if (col === 'overall') { valA = a.overall_percent || 0; valB = b.overall_percent || 0; }
        else {
            valA = (a.themes[col] && a.themes[col].avg_sentiment !== undefined) ? parseFloat(a.themes[col].avg_sentiment) : -999;
            valB = (b.themes[col] && b.themes[col].avg_sentiment !== undefined) ? parseFloat(b.themes[col].avg_sentiment) : -999;
        }

        if (typeof valA === 'string') {
            return dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
            return dir === 'asc' ? valA - valB : valB - valA;
        }
    });

    // Update global sort state for UI
    CURRENT_SORT.col = col;
    CURRENT_SORT.dir = dir;
}

function renderMatrixTable() {
    const table = d3.select("#matrix-real-table");
    table.select("thead").selectAll("*").remove();
    table.select("tbody").selectAll("*").remove();

    // --- HEADER ---
    const headerRow = table.select("thead").append("tr");

    const addHeader = (text, width, key, bg) => {
        const h = headerRow.append("th")
            .text(text)
            .style("width", width)
            .style("cursor", "pointer")
            .attr("title", "Click to sort");

        if (bg) h.style("background", bg);

        if (CURRENT_SORT.col === key) {
            h.append("span").style("margin-left", "5px").style("font-size", "10px").text(CURRENT_SORT.dir === 'asc' ? "▲" : "▼");
        }

        h.on("click", () => handleSort(key));
    };

    addHeader("# School", "260px", "name");
    addHeader("City/Country", "180px", "city");
    addHeader("Overall Score", "180px", "overall", "#f1f5f9");

    THEMES.forEach(t => {
        addHeader(t, "110px", t);
    });

    // --- BODY ---
    const tbody = table.select("tbody");

    tbody.selectAll("tr").data(SCHOOLS_LIST).join("tr").each(function (school, sIdx) {
        const tr = d3.select(this);
        const tdName = tr.append("td").style("white-space", "nowrap");
        tdName.append("span").style("color", "#64748b").style("margin-right", "8px").style("font-size", "11px").text(sIdx + 1);

        // Link to PDF
        const link = tdName.append("a")
            .attr("href", `School_Reports/${encodeURIComponent(school.name)}.pdf`)
            .attr("target", "_blank")
            .style("text-decoration", "none")
            .style("display", "inline-block"); // Ensure clickability

        link.append("span")
            .style("font-weight", "600")
            .style("color", "#0f172a")
            .text(school.name)
            .on("mouseover", function () { d3.select(this).style("text-decoration", "underline").style("color", "#2563eb"); })
            .on("mouseout", function () { d3.select(this).style("text-decoration", "none").style("color", "#0f172a"); });

        tr.append("td").style("color", "#334155").style("font-size", "13px").style("font-weight", "500").style("white-space", "nowrap").text(school.city || "—");

        const scorePct = school.overall_percent || 0;
        let ovColor = "#ef4444";
        let ovTextCol = "#fff";

        if (scorePct >= 40) { ovColor = "#15803d"; ovTextCol = "#fff"; } // Dark Green
        else if (scorePct >= 10) { ovColor = "#86efac"; ovTextCol = "#065f46"; } // Light Green
        else if (scorePct >= -9) { ovColor = "#fcd34d"; ovTextCol = "#78350f"; } // Yellow
        else if (scorePct >= -39) { ovColor = "#fca5a5"; ovTextCol = "#991b1b"; } // Light Red
        else { ovColor = "#7f1d1d"; ovTextCol = "#fff"; } // Dark Red (Default for <-39)

        const tdOverall = tr.append("td").style("background", "#f8fafc").style("text-align", "center").style("cursor", "pointer");
        tdOverall.on("click", () => openOverallDetail(sIdx)); // Click handler for Overall

        tdOverall.append("div")
            .style("display", "inline-block")
            .style("padding", "4px 8px")
            .style("border-radius", "6px")
            .style("font-weight", "700")
            .style("font-size", "12px")
            .style("min-width", "40px")
            .style("background", ovColor)
            .style("color", ovTextCol)
            .text(`${scorePct > 0 ? "+" : ""}${scorePct}%`);

        THEMES.forEach((theme, tIdx) => {
            const td = tr.append("td");
            const item = school.themes[theme];
            let bucket = "missing";
            if (item && item.sentiment_bucket) {
                const val = item.sentiment_bucket.toLowerCase();
                if (val.includes("very positive")) bucket = "very-positive";
                else if (val.includes("very negative")) bucket = "very-negative";
                else if (val.includes("positive")) bucket = "positive"; // Check "very" first
                else if (val.includes("negative")) bucket = "negative";
                else if (val.includes("neutral") || val.includes("mixed")) bucket = "neutral";
            }

            // Score
            let displayScore = "—";
            if (item) {
                // Use the pre-calculated percent from Python (already normalized /2 * 100)
                const pct = item.sentiment_pct !== undefined ? item.sentiment_pct : 0;
                displayScore = (pct > 0 ? "+" : "") + pct + "%";
            }

            td.append("div")
                .attr("class", `matrix-score-cell ${bucket}`)
                .attr("id", `cell-${sIdx}-${tIdx}`)
                .attr("title", item ? `Score: ${displayScore}` : "No Data")
                .text("")
                .on("click", () => selectAndOpen(sIdx, tIdx, true));
        });
    });
}

function selectAndOpen(sIdx, tIdx, openModalFlag) {
    CURRENT_SCHOOL_IDX = sIdx;
    CURRENT_THEME_IDX = tIdx;
    d3.selectAll(".matrix-score-cell").classed("selected-cell", false);
    const cell = d3.select(`#cell-${sIdx}-${tIdx}`);
    cell.classed("selected-cell", true);
    if (openModalFlag) openModalDetail(sIdx, tIdx);
}

function openOverallDetail(sIdx) {
    const school = SCHOOLS_LIST[sIdx];
    IS_MODAL_OPEN = true;
    const modalOverlay = document.querySelector(".modal-overlay");
    const modalTitle = document.getElementById("m-title");
    const modalBody = document.querySelector(".modal-body");

    modalOverlay.style.display = "flex";
    modalTitle.innerHTML = `<span style="color:#94a3b8; font-weight:400;">${school.name}</span><br/>All Themes`;
    modalBody.innerHTML = "";

    // Aggregate verbatims
    let allQuotes = [];
    THEMES.forEach(t => {
        const item = school.themes[t];
        if (item && item.example_verbatims) {
            try {
                const qs = JSON.parse(item.example_verbatims);
                // Tag them with theme for context
                qs.forEach(q => q._theme = t);
                allQuotes = allQuotes.concat(qs);
            } catch (e) { }
        }
    });

    if (allQuotes.length === 0) {
        modalBody.innerHTML = "<div style='color:#9CA3AF; font-style:italic; padding:20px; text-align:center;'>No feedback recorded for this school.</div>";
        return;
    }

    // Header Summary
    const head = document.createElement("div");
    head.style.marginBottom = "20px"; head.style.padding = "12px"; head.style.background = "#f8fafc"; head.style.borderRadius = "8px"; head.style.border = "1px solid #e2e8f0";
    head.innerHTML = `<div style="font-size:14px; color:#475569; font-weight:600;">Consolidated Verbatims (${allQuotes.length} quotes)</div>`;
    modalBody.appendChild(head);

    // Render Quotes
    const getColorForBucket = (b) => {
        b = (b || "").toLowerCase();
        if (b.includes('very positive')) return "var(--sent-v-pos)";
        if (b.includes('positive')) return "var(--sent-pos)";
        if (b.includes('very negative')) return "var(--sent-v-neg)";
        if (b.includes('negative')) return "var(--sent-neg)";
        return "var(--sent-neu)";
    };
    const cleanQuote = (txt) => (txt || "").replace(/^"+|"+$/g, '').trim();

    allQuotes.forEach(q => {
        const qColor = getColorForBucket(q.bucket);
        const qText = cleanQuote(q.text);

        const d = document.createElement("div");
        d.className = "v-item";
        d.style.marginBottom = "12px"; d.style.padding = "12px"; d.style.borderLeft = `4px solid ${qColor}`; d.style.background = "#fff"; d.style.borderRadius = "0 6px 6px 0"; d.style.boxShadow = "0 1px 2px rgba(0,0,0,0.05)";

        d.innerHTML = `
            <div style="font-size:10px; color:#64748b; margin-bottom:4px; display:flex; justify-content:space-between;">
                <span style="font-weight:700; color:${qColor}; text-transform:uppercase;">${q.bucket}</span>
                <span style="color:#94a3b8; font-weight:600;">${q._theme}</span>
            </div>
            <div style="font-size:13px; color:#334155; font-family:'Georgia', serif; font-style:italic;">"${qText}"</div>
        `;
        modalBody.appendChild(d);
    });

    // Close logic matches existing
    const closer = () => { IS_MODAL_OPEN = false; modalOverlay.style.display = "none"; };
    document.getElementById("m-close").onclick = closer;
    modalOverlay.onclick = (e) => { if (e.target === modalOverlay) closer(); };
}

function openModalDetail(sIdx, tIdx) {
    const school = SCHOOLS_LIST[sIdx];
    const theme = THEMES[tIdx];
    const item = school.themes[theme];
    IS_MODAL_OPEN = true;

    const modalOverlay = document.querySelector(".modal-overlay");
    const modalTitle = document.getElementById("m-title");
    const modalBody = document.querySelector(".modal-body");

    modalOverlay.style.display = "flex";
    modalTitle.innerHTML = `<span style="color:#94a3b8; font-weight:400;">${school.name}</span><br/>${theme}`;
    modalBody.innerHTML = "";

    if (!item) {
        modalBody.innerHTML = "<div style='color:#9CA3AF; font-style:italic; padding:20px; text-align:center;'>No feedback recorded for this theme.</div>";
    } else {
        const pct = item.sentiment_pct !== undefined ? item.sentiment_pct : 0;
        const displayScore = (pct > 0 ? "+" : "") + pct + "%";
        const bucket = (item.sentiment_bucket || "").toLowerCase().replace(" ", "-");

        let badgeColor = "var(--sent-neu)";
        if (bucket.includes('positive')) badgeColor = "var(--sent-pos)";
        if (bucket.includes('negative')) badgeColor = "var(--sent-neg)";

        const head = document.createElement("div");
        head.style.display = "flex"; head.style.justifyContent = "space-between"; head.style.alignItems = "center";
        head.style.marginBottom = "20px"; head.style.padding = "12px"; head.style.background = "#f8fafc"; head.style.borderRadius = "8px"; head.style.border = "1px solid #e2e8f0";
        head.innerHTML = `
            <div>
                <div style="font-size:11px; color:#64748b; text-transform:uppercase; font-weight:700; letter-spacing:0.5px; margin-bottom:4px;">Sentiment Score</div>
                <div style="font-size:24px; font-weight:800; color:${badgeColor};"><span style="font-size:12px; font-weight:600; vertical-align:middle; margin-right:8px; opacity:0.8;">(${item.sentiment_bucket})</span> ${displayScore}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:11px; color:#64748b; text-transform:uppercase; font-weight:700; letter-spacing:0.5px; margin-bottom:4px;">Volume</div>
                <div style="font-size:18px; font-weight:700; color:#1e293b; margin-bottom:4px;">${item.count} quotes</div>
                <div style="font-size:10px; color:#64748b; display:flex; gap:8px; justify-content:flex-end;">
                    <span style="color:var(--sent-pos); font-weight:600;">${item.sentiment_breakdown?.pos || 0} Pos</span>
                    <span style="color:var(--sent-neu); font-weight:600;">${item.sentiment_breakdown?.neu || 0} Neu</span>
                    <span style="color:var(--sent-neg); font-weight:600;">${item.sentiment_breakdown?.neg || 0} Neg</span>
                </div>
            </div>
        `;
        modalBody.appendChild(head);

        try {
            const quotes = JSON.parse(item.example_verbatims || "[]");
            if (quotes.length === 0) {
                modalBody.innerHTML += "<div style='color:#64748b; font-style:italic;'>No specific verbatims available.</div>";
            } else {
                const featured = quotes[0];
                const others = quotes.slice(1);

                // Helper to get color from specific bucket string
                const getColorForBucket = (b) => {
                    b = (b || "").toLowerCase();
                    if (b.includes('very positive')) return "var(--sent-v-pos)";
                    if (b.includes('positive')) return "var(--sent-pos)";
                    if (b.includes('very negative')) return "var(--sent-v-neg)";
                    if (b.includes('negative')) return "var(--sent-neg)";
                    return "var(--sent-neu)";
                };

                // Quote cleaner
                const cleanQuote = (txt) => {
                    if (!txt) return "";
                    // Remove leading/trailing quotes often found in CSV imports
                    return txt.replace(/^"+|"+$/g, '').trim();
                };

                const fColor = getColorForBucket(featured.bucket);
                const featuredText = cleanQuote(featured.text);

                const featuredBox = document.createElement("div");
                featuredBox.className = "featured-verbatim-box";
                featuredBox.style.borderLeft = `5px solid ${fColor}`; // Increased width for visibility
                featuredBox.style.background = featured.bucket.toLowerCase().includes('negative') ? '#fffaf8' : (featured.bucket.toLowerCase().includes('positive') ? '#f0fdf4' : '#f8fafc');
                featuredBox.style.padding = "20px"; featuredBox.style.borderRadius = "0 8px 8px 0"; featuredBox.style.marginBottom = "24px";

                featuredBox.innerHTML = `
                    <div style="font-size:11px; color:${fColor}; text-transform:uppercase; font-weight:800; margin-bottom:12px;"><span style="font-weight:400; opacity:0.7">(${featured.bucket})</span></div>
                    <div style="font-size:15px; color:#1e293b; font-style:italic; line-height:1.6; font-family:'Georgia', serif;">"${featuredText}"</div>
                `;
                modalBody.appendChild(featuredBox);

                if (others.length > 0) {
                    const otherHead = document.createElement("div");
                    otherHead.style.fontSize = "12px"; otherHead.style.fontWeight = "700"; otherHead.style.color = "#64748b"; otherHead.style.textTransform = "uppercase"; otherHead.style.marginBottom = "12px"; otherHead.textContent = "Supporting Context";
                    modalBody.appendChild(otherHead);
                    others.forEach(q => {
                        const qColor = getColorForBucket(q.bucket);
                        const qText = cleanQuote(q.text);
                        const d = document.createElement("div");
                        d.className = "v-item";
                        d.style.marginBottom = "8px";
                        d.style.padding = "10px";
                        d.style.borderLeft = `4px solid ${qColor}`; // Explicit border style
                        d.style.background = "#fff";
                        d.style.fontSize = "13px";
                        d.style.color = "#475569";
                        d.innerHTML = `<span style="font-weight:700; color:${qColor}; font-size:10px; text-transform:uppercase; display:block; margin-bottom:4px;">${q.bucket}</span> "${qText}"`;
                        modalBody.appendChild(d);
                    });
                }
            }
        } catch (e) {
            console.error(e);
            modalBody.innerHTML += "<div style='color:#ef4444;'>Error loading verbatims.</div>";
        }
    }
    const closer = () => { IS_MODAL_OPEN = false; modalOverlay.style.display = "none"; };
    document.getElementById("m-close").onclick = closer;
    modalOverlay.onclick = (e) => { if (e.target === modalOverlay) closer(); };
}
function closeModal() {
    IS_MODAL_OPEN = false;
    const overlay = document.querySelector(".modal-overlay");
    if (overlay) overlay.style.display = "none";
}
