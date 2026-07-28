/**
 * Application Logic: LPG Consumer Portal
 * Features: IndexedDB management, CSV uploading and parsing, Dashboard analytics,
 *           Bulk searching, Pagination, PDF/CSV exporting, Theme toggler.
 */

// Global State
let db = null;
let allConsumers = [];
let filteredConsumers = [];
let chartInstances = {};
let allConsumersCurrentPage = 1;
const ITEMS_PER_PAGE = 50;

// IndexedDB Constants
const DB_NAME = "LPGConsumerPortalDB";
const DB_VERSION = 1;
const STORE_NAME = "consumers";

// ==========================================================================
// 1. Initialize App & Database
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    initDatabase()
        .then(() => {
            // Check if we have data cached in IndexedDB
            return checkCachedData();
        })
        .then((hasData) => {
            initEventListeners();
            initTheme();
            if (hasData) {
                loadDashboardFromDB();
            } else {
                showView("upload-view");
            }
        })
        .catch((error) => {
            console.error("Database initialization failed:", error);
            initEventListeners();
            initTheme();
            showView("upload-view");
        });
});

// Initialize IndexedDB
function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const dbInstance = event.target.result;
            if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
                // We use ConsumerNo as the primary key. Trimmed strings for accuracy
                dbInstance.createObjectStore(STORE_NAME, { keyPath: "ConsumerNo" });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve();
        };

        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

// Check if database contains consumer records
function checkCachedData() {
    return new Promise((resolve, reject) => {
        if (!db) return resolve(false);
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const countRequest = store.count();

        countRequest.onsuccess = () => {
            resolve(countRequest.result > 0);
        };

        countRequest.onerror = () => {
            resolve(false);
        };
    });
}

// ==========================================================================
// 2. View Management & Navigation
// ==========================================================================
function showView(viewId) {
    // Hide all views first
    document.querySelectorAll(".view-panel").forEach((panel) => {
        panel.classList.add("hidden");
    });
    
    // Show requested view
    const targetPanel = document.getElementById(viewId);
    if (targetPanel) {
        targetPanel.classList.remove("hidden");
    }

    // Refresh Lucide icons
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function handleTabClick(event) {
    const btn = event.currentTarget;
    const tabId = btn.getAttribute("data-tab");

    // Update Nav buttons state
    document.querySelectorAll(".nav-item").forEach((item) => {
        item.classList.remove("active");
    });
    btn.classList.add("active");

    // Update Tab pane state
    document.querySelectorAll(".tab-pane").forEach((pane) => {
        pane.classList.remove("active");
    });
    const targetPane = document.getElementById(tabId);
    if (targetPane) {
        targetPane.classList.add("active");
    }

    // Update Navbar Title
    const titleMap = {
        "dashboard-tab": "Dashboard Overview",
        "bulk-search-tab": "Bulk Consumer Search",
        "all-consumers-tab": "Complete Consumer Directory",
        "excel-filler-tab": "Excel Auto-Filler Tool"
    };
    document.getElementById("current-view-title").textContent = titleMap[tabId] || "Dashboard";

    // Extra action when switching tabs
    if (tabId === "all-consumers-tab") {
        renderAllConsumersTable();
    }
}

// Initialize Theme
function initTheme() {
    const currentTheme = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", currentTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    
    // Update chart colors if chart exists
    if (allConsumers.length > 0) {
        updateChartThemes(newTheme);
    }
}

// ==========================================================================
// 3. Database Operations (Read/Write/Delete)
// ==========================================================================
function saveConsumersToDB(data) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);

        // Clear existing records first
        const clearRequest = store.clear();
        clearRequest.onsuccess = () => {
            // Write records synchronously in a single transaction
            for (let i = 0; i < data.length; i++) {
                const record = data[i];
                if (record.ConsumerNo) {
                    record.ConsumerNo = record.ConsumerNo.trim();
                    store.put(record);
                }
            }
        };

        transaction.oncomplete = () => {
            resolve();
        };

        transaction.onerror = (e) => {
            reject(e.target.error);
        };
    });
}

function getAllConsumersFromDB() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = (e) => {
            reject(e.target.error);
        };
    });
}

function getConsumersByNos(nos) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const results = [];
        let fetchedCount = 0;

        if (nos.length === 0) return resolve([]);

        nos.forEach((no) => {
            const req = store.get(no);
            req.onsuccess = () => {
                if (req.result) {
                    results.push(req.result);
                }
                fetchedCount++;
                if (fetchedCount === nos.length) {
                    resolve(results);
                }
            };
            req.onerror = () => {
                fetchedCount++;
                if (fetchedCount === nos.length) {
                    resolve(results);
                }
            };
        });
    });
}

// Clear all database cache and reset views
function removeDataAndReset() {
    if (!confirm("Are you sure you want to remove all consumer data? This will reset the app.")) {
        return;
    }

    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.clear();

    transaction.oncomplete = () => {
        allConsumers = [];
        filteredConsumers = [];
        destroyCharts();
        
        // Reset inputs
        document.getElementById("csv-file-input").value = "";
        document.getElementById("bulk-input-textarea").value = "";
        document.getElementById("navbar-quick-search").value = "";
        document.getElementById("inline-all-search").value = "";
        
        // Reset tables
        document.getElementById("all-consumers-table-body").innerHTML = "";
        resetBulkSearchTable();

        showView("upload-view");
    };

    transaction.onerror = (e) => {
        alert("Failed to clear database: " + e.target.error);
    };
}

// ==========================================================================
// 4. File Upload & CSV Parsing
// ==========================================================================
function handleFileUpload(file) {
    if (!file) return;

    const progressContainer = document.getElementById("upload-progress-container");
    const progressBar = document.getElementById("upload-progress-bar");
    const statusText = document.getElementById("upload-progress-status");
    const errorBanner = document.getElementById("upload-error");

    progressContainer.classList.remove("hidden");
    errorBanner.classList.add("hidden");
    progressBar.style.width = "0%";
    statusText.textContent = "Loading file...";

    // Parse CSV with PapaParse
    Papa.parse(file, {
        header: true,
        skipEmptyLines: "greedy",
        encoding: "UTF-8",
        complete: async (results) => {
            if (results.errors.length > 0 && results.data.length === 0) {
                console.error("PapaParse errors:", results.errors);
                showUploadError("Could not parse file. Verify that it is a valid CSV report.");
                return;
            }

            const rawData = results.data;
            statusText.textContent = `Parsed ${rawData.length.toLocaleString()} rows. Saving to browser storage...`;
            progressBar.style.width = "50%";

            try {
                // Filter out records without consumer numbers, allowing both key formats, and normalize
                const validData = rawData
                    .filter(item => {
                        const keys = Object.keys(item);
                        const cnoKey = keys.find(k => k.trim().toLowerCase() === 'consumerno' || k.trim().toLowerCase() === 'consumer no');
                        return cnoKey && item[cnoKey] && item[cnoKey].trim() !== "";
                    })
                    .map(item => normalizeConsumerRecord(item));
                
                await saveConsumersToDB(validData);
                
                progressBar.style.width = "100%";
                statusText.textContent = "Data successfully saved! Generating dashboard...";

                // Delay slightly to show completion
                setTimeout(() => {
                    progressContainer.classList.add("hidden");
                    loadDashboardFromDB();
                }, 500);

            } catch (err) {
                console.error("IndexedDB Save Error:", err);
                showUploadError("Failed to store data inside IndexedDB browser storage.");
            }
        },
        error: (err) => {
            console.error("Parsing Error:", err);
            showUploadError("An error occurred during file parsing: " + err.message);
        }
    });
}

function showUploadError(message) {
    const progressContainer = document.getElementById("upload-progress-container");
    const errorBanner = document.getElementById("upload-error");
    const errorText = document.getElementById("upload-error-text");

    progressContainer.classList.add("hidden");
    errorBanner.classList.remove("hidden");
    errorText.textContent = message;
}

// ==========================================================================
// 5. Dashboard Generation & Statistics
// ==========================================================================
async function loadDashboardFromDB() {
    try {
        allConsumers = await getAllConsumersFromDB();
        filteredConsumers = [...allConsumers];
        
        // Update sidebar label
        document.getElementById("sidebar-record-count").textContent = `${allConsumers.length.toLocaleString()} consumers`;

        // Calculate statistics & build UI
        generateKPIs();
        renderCharts();
        
        showView("main-view");
    } catch (error) {
        console.error("Error loading dashboard data:", error);
        alert("Failed to load dashboard data from database cache.");
        showView("upload-view");
    }
}

function generateKPIs() {
    const total = allConsumers.length;
    let ekycCount = 0;
    let totalDeposit = 0;
    let domesticCount = 0;

    allConsumers.forEach((consumer) => {
        // eKYC Flag
        if (consumer.EKYCFlag === "Y") {
            ekycCount++;
        }

        // Security Deposit (Aggregate DepositAmount)
        const deposit = parseFloat(consumer.DepositAmount) || 0;
        totalDeposit += deposit;

        // Domestic Package check
        const pkgDesc = (consumer.PackageCodeDescription || "").toLowerCase();
        const nature = (consumer.NatureOfConnection || "").toLowerCase();
        if (pkgDesc.includes("14.2 kg") || pkgDesc.includes("domestic") || pkgDesc.includes("sbc") || pkgDesc.includes("dbc") || nature.includes("domestic")) {
            domesticCount++;
        }
    });

    const ekycPct = total > 0 ? ((ekycCount / total) * 100).toFixed(1) : 0;
    const domesticPct = total > 0 ? ((domesticCount / total) * 100).toFixed(1) : 0;

    // Set UI values
    document.getElementById("kpi-total-consumers").textContent = total.toLocaleString();
    document.getElementById("kpi-ekyc-rate").textContent = `${ekycPct}%`;
    document.getElementById("kpi-ekyc-count").textContent = `${ekycCount.toLocaleString()} of ${total.toLocaleString()}`;
    document.getElementById("kpi-total-deposit").textContent = `₹${totalDeposit.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    document.getElementById("kpi-domestic-count").textContent = domesticCount.toLocaleString();
    document.getElementById("kpi-domestic-pct").textContent = `${domesticPct}% of total`;
}

// ==========================================================================
// 6. Chart.js Graphs Configuration
// ==========================================================================
function renderCharts() {
    destroyCharts();

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const textThemeColor = isDark ? "#9ca3af" : "#475569";
    const gridThemeColor = isDark ? "#374151" : "#e2e8f0";

    // 1. eKYC Status Pie Chart
    const ekycYes = allConsumers.filter(c => c.EKYCFlag === "Y").length;
    const ekycNo = allConsumers.length - ekycYes;

    const ctxEkyc = document.getElementById("chart-ekyc").getContext("2d");
    chartInstances.ekyc = new Chart(ctxEkyc, {
        type: "doughnut",
        data: {
            labels: ["Verified (Y)", "Unverified (N)"],
            datasets: [{
                data: [ekycYes, ekycNo],
                backgroundColor: ["#10b981", "#ef4444"],
                borderColor: isDark ? "#111827" : "#ffffff",
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { color: textThemeColor, font: { family: "Plus Jakarta Sans" } }
                }
            }
        }
    });

    // 2. Connection Type Distribution Chart
    const connTypes = {};
    allConsumers.forEach(c => {
        const type = c.TypeOfConnection || "Unknown";
        connTypes[type] = (connTypes[type] || 0) + 1;
    });

    const connLabels = Object.keys(connTypes);
    const connData = Object.values(connTypes);

    const ctxConn = document.getElementById("chart-connection-type").getContext("2d");
    chartInstances.connType = new Chart(ctxConn, {
        type: "pie",
        data: {
            labels: connLabels.map(lbl => lbl.replace(/^\d+\s*-\s*/, '')), // Clean up codes
            datasets: [{
                data: connData,
                backgroundColor: ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ec4899", "#6b7280"],
                borderColor: isDark ? "#111827" : "#ffffff",
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { color: textThemeColor, font: { family: "Plus Jakarta Sans" } }
                }
            }
        }
    });

    // 3. Cylinder Package Code Distribution Chart (Top 5 + Others)
    const pkgCounts = {};
    allConsumers.forEach(c => {
        const pkg = c.PackageCodeDescription || "Unknown Packaging";
        pkgCounts[pkg] = (pkgCounts[pkg] || 0) + 1;
    });

    const sortedPkgs = Object.entries(pkgCounts).sort((a, b) => b[1] - a[1]);
    const topPkgs = sortedPkgs.slice(0, 5);
    let topPkgsSum = 0;
    topPkgs.forEach(p => topPkgsSum += p[1]);
    const otherPkgsSum = allConsumers.length - topPkgsSum;

    const pkgLabels = topPkgs.map(p => p[0].substring(0, 30) + (p[0].length > 30 ? "..." : ""));
    const pkgData = topPkgs.map(p => p[1]);

    if (otherPkgsSum > 0) {
        pkgLabels.push("Others");
        pkgData.push(otherPkgsSum);
    }

    const ctxPkg = document.getElementById("chart-package").getContext("2d");
    chartInstances.package = new Chart(ctxPkg, {
        type: "bar",
        data: {
            labels: pkgLabels,
            datasets: [{
                label: "Consumers count",
                data: pkgData,
                backgroundColor: "#3b82f6",
                borderRadius: 6
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: gridThemeColor },
                    ticks: { color: textThemeColor, font: { family: "Plus Jakarta Sans", size: 10 } }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: textThemeColor, font: { family: "Plus Jakarta Sans", size: 10 } }
                }
            }
        }
    });

    // 4. Area Distribution (Top 8 + Others)
    const areaCounts = {};
    allConsumers.forEach(c => {
        const area = c.Area || "Unmapped Area";
        areaCounts[area] = (areaCounts[area] || 0) + 1;
    });

    const sortedAreas = Object.entries(areaCounts).sort((a, b) => b[1] - a[1]);
    const topAreas = sortedAreas.slice(0, 8);
    let topAreasSum = 0;
    topAreas.forEach(a => topAreasSum += a[1]);
    const otherAreasSum = allConsumers.length - topAreasSum;

    const areaLabels = topAreas.map(a => a[0]);
    const areaData = topAreas.map(a => a[1]);

    if (otherAreasSum > 0) {
        areaLabels.push("Others");
        areaData.push(otherAreasSum);
    }

    const ctxArea = document.getElementById("chart-area").getContext("2d");
    chartInstances.area = new Chart(ctxArea, {
        type: "bar",
        data: {
            labels: areaLabels,
            datasets: [{
                label: "Active Consumers",
                data: areaData,
                backgroundColor: "#8b5cf6",
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    grid: { color: gridThemeColor },
                    ticks: { color: textThemeColor, font: { family: "Plus Jakarta Sans", size: 10 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: textThemeColor, font: { family: "Plus Jakarta Sans", size: 10 } }
                }
            }
        }
    });
}

function destroyCharts() {
    Object.keys(chartInstances).forEach((key) => {
        if (chartInstances[key]) {
            chartInstances[key].destroy();
        }
    });
    chartInstances = {};
}

function updateChartThemes(newTheme) {
    const isDark = newTheme === "dark";
    const textColor = isDark ? "#9ca3af" : "#475569";
    const gridColor = isDark ? "#374151" : "#e2e8f0";

    Object.keys(chartInstances).forEach((key) => {
        const chart = chartInstances[key];
        
        // Colors for scales
        if (chart.options.scales) {
            if (chart.options.scales.x) {
                chart.options.scales.x.ticks.color = textColor;
                if (chart.options.scales.x.grid) {
                    chart.options.scales.x.grid.color = gridColor;
                }
            }
            if (chart.options.scales.y) {
                chart.options.scales.y.ticks.color = textColor;
                if (chart.options.scales.y.grid) {
                    chart.options.scales.y.grid.color = gridColor;
                }
            }
        }

        // Legends color
        if (chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.labels) {
            chart.options.plugins.legend.labels.color = textColor;
        }

        // Borders color
        if (chart.data.datasets && chart.data.datasets[0] && chart.config.type !== 'bar') {
            chart.data.datasets[0].borderColor = isDark ? "#111827" : "#ffffff";
        }

        chart.update();
    });
}

// ==========================================================================
// 7. Complete Directory (All Consumers Pagination & Filter)
// ==========================================================================
function filterAllConsumers() {
    const query = document.getElementById("inline-all-search").value.toLowerCase().trim();
    if (query === "") {
        filteredConsumers = [...allConsumers];
    } else {
        filteredConsumers = allConsumers.filter((c) => {
            return (c.ConsumerNo || "").toLowerCase().includes(query) ||
                   (c.ConsumerName || "").toLowerCase().includes(query) ||
                   (c.MobileNo || "").toLowerCase().includes(query) ||
                   (c.Area || "").toLowerCase().includes(query) ||
                   (c.PackageCodeDescription || "").toLowerCase().includes(query);
        });
    }

    allConsumersCurrentPage = 1;
    renderAllConsumersTable();
}

function renderAllConsumersTable() {
    const tbody = document.getElementById("all-consumers-table-body");
    tbody.innerHTML = "";

    const totalRecords = filteredConsumers.length;
    const totalPages = Math.ceil(totalRecords / ITEMS_PER_PAGE) || 1;

    // Bound page check
    if (allConsumersCurrentPage < 1) allConsumersCurrentPage = 1;
    if (allConsumersCurrentPage > totalPages) allConsumersCurrentPage = totalPages;

    // Pagination controls state
    document.getElementById("btn-prev-page").disabled = allConsumersCurrentPage === 1;
    document.getElementById("btn-next-page").disabled = allConsumersCurrentPage === totalPages;
    document.getElementById("page-indicator").textContent = `Page ${allConsumersCurrentPage} of ${totalPages} (${totalRecords.toLocaleString()} consumers)`;

    // Slice page consumers
    const startOffset = (allConsumersCurrentPage - 1) * ITEMS_PER_PAGE;
    const endOffset = Math.min(startOffset + ITEMS_PER_PAGE, totalRecords);
    const pageData = filteredConsumers.slice(startOffset, endOffset);

    if (pageData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="table-placeholder">
                    <i data-lucide="search-x"></i>
                    <p>No consumers matched your search parameters.</p>
                </td>
            </tr>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    pageData.forEach((c) => {
        const tr = document.createElement("tr");

        const isEkyc = c.EKYCFlag === "Y";
        const ekycBadge = isEkyc 
            ? '<span class="badge green">Y</span>' 
            : '<span class="badge red">N</span>';

        const depositVal = parseFloat(c.DepositAmount) || 0;

        const refillDate = c.LastRefillDate || "N/A";
        const daysAgoVal = calculateDaysSince(c.LastRefillDate);
        const daysAgoClass = getRefillStatusClass(c.LastRefillDate);

        tr.innerHTML = `
            <td><strong>${escapeHTML(c.ConsumerNo)}</strong></td>
            <td>${escapeHTML(c.ConsumerName)}</td>
            <td>${escapeHTML(c.MobileNo || "N/A")}</td>
            <td>${escapeHTML(c.Area || "N/A")}</td>
            <td>${escapeHTML(refillDate)}</td>
            <td><span class="days-ago-label ${daysAgoClass}">${escapeHTML(daysAgoVal)}</span></td>
            <td>${ekycBadge}</td>
            <td>${escapeHTML(c.CylinderPackageCode || "N/A")}</td>
            <td>₹${depositVal.toLocaleString("en-IN")}</td>
            <td>
                <button class="btn-row-action" onclick="openConsumerDetails('${escapeHTML(c.ConsumerNo)}')">View</button>
            </td>
        `;

        tbody.appendChild(tr);
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// ==========================================================================
// 8. Quick Search (Navbar Typeahead)
// ==========================================================================
let quickSearchTimeout = null;

function handleQuickSearchInput() {
    clearTimeout(quickSearchTimeout);
    const query = document.getElementById("navbar-quick-search").value.toLowerCase().trim();
    const dropdown = document.getElementById("quick-search-results");

    if (query.length < 2) {
        dropdown.innerHTML = "";
        dropdown.classList.add("hidden");
        return;
    }

    // Debounce search slightly
    quickSearchTimeout = setTimeout(() => {
        const matches = allConsumers.filter((c) => {
            return (c.ConsumerNo || "").toLowerCase().includes(query) ||
                   (c.ConsumerName || "").toLowerCase().includes(query);
        }).slice(0, 8); // Limit to top 8 quick items

        dropdown.innerHTML = "";
        if (matches.length === 0) {
            dropdown.innerHTML = '<div class="quick-search-item" style="cursor:default; color:var(--text-muted)">No matching records found.</div>';
        } else {
            matches.forEach((c) => {
                const div = document.createElement("div");
                div.className = "quick-search-item";
                div.innerHTML = `
                    <strong>${escapeHTML(c.ConsumerName)}</strong>
                    <span>Consumer No: ${escapeHTML(c.ConsumerNo)} | Area: ${escapeHTML(c.Area || "N/A")}</span>
                `;
                div.addEventListener("click", () => {
                    dropdown.classList.add("hidden");
                    document.getElementById("navbar-quick-search").value = "";
                    openConsumerDetails(c.ConsumerNo);
                });
                dropdown.appendChild(div);
            });
        }
        dropdown.classList.remove("hidden");
    }, 150);
}

// Hide dropdown on click outside
document.addEventListener("click", (e) => {
    const dropdown = document.getElementById("quick-search-results");
    const searchBox = document.querySelector(".search-box");
    if (dropdown && searchBox && !searchBox.contains(e.target)) {
        dropdown.classList.add("hidden");
    }
});

// ==========================================================================
// 9. Bulk Consumer Searching
// ==========================================================================
let matchedBulkRecords = [];

async function performBulkSearch() {
    const rawInput = document.getElementById("bulk-input-textarea").value;
    // Extract words, integers, or hyphenated codes
    const nos = rawInput
        .split(/[\s,;\n\r]+/)
        .map(no => no.trim())
        .filter(no => no.length > 0);

    if (nos.length === 0) {
        alert("Please paste one or more Consumer Numbers first.");
        return;
    }

    const btnSearch = document.getElementById("btn-search-bulk");
    btnSearch.disabled = true;
    btnSearch.innerHTML = '<span class="loader-inline">Searching...</span>';

    try {
        // Query IndexedDB
        matchedBulkRecords = await getConsumersByNos(nos);
        
        // Find unmatched IDs
        const uniqueSearched = [...new Set(nos)];
        const matchedSet = new Set(matchedBulkRecords.map(c => c.ConsumerNo));
        const unmatched = uniqueSearched.filter(no => !matchedSet.has(no));

        // Render matches
        renderBulkSearchTable(unmatched);
    } catch (e) {
        console.error("Bulk search query failed:", e);
        alert("An error occurred during bulk search querying.");
    } finally {
        btnSearch.disabled = false;
        btnSearch.innerHTML = '<i data-lucide="search"></i> Search Consumers';
        if (window.lucide) window.lucide.createIcons();
    }
}

function handleBulkExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const sheetData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

            if (sheetData.length === 0) {
                alert("The uploaded Excel/CSV sheet contains no records.");
                return;
            }

            // Find key dynamically
            const headers = Object.keys(sheetData[0]);
            const consumerNoKey = headers.find(h => {
                const clean = h.trim().toLowerCase().replace(/[\s_\-\.]/g, '');
                return clean.includes("consumerno") || 
                       clean.includes("customerno") || 
                       clean.includes("consumerid") || 
                       clean.includes("customerid") ||
                       clean === "consumerno" ||
                       clean === "customerno";
            });

            if (!consumerNoKey) {
                alert("Could not find a column named 'Consumer No' or 'Customer No' in the uploaded sheet.\nAvailable columns: " + headers.join(", "));
                return;
            }

            // Extract all customer numbers from this column
            const numbers = sheetData
                .map(row => {
                    const rawVal = row[consumerNoKey];
                    if (rawVal === undefined || rawVal === null) return "";
                    return rawVal.toString().trim().replace(/^'/, ''); // remove leading quotes
                })
                .filter(num => num.length > 0 && !isNaN(num));

            if (numbers.length === 0) {
                alert(`No valid consumer numbers found under column '${consumerNoKey}'.`);
                return;
            }

            // Populate text area
            document.getElementById("bulk-input-textarea").value = numbers.join("\n");

            // Clear input selection so user can upload the same file again if they edit it
            event.target.value = "";

            // Auto-trigger search
            performBulkSearch();

        } catch (err) {
            console.error("Excel sheet parse error:", err);
            alert("Error parsing the file. Please ensure it is a valid Excel (.xlsx, .xls) or CSV (.csv) file.");
        }
    };
    reader.readAsArrayBuffer(file);
}

let uploadedWorkbook = null;
let uploadedFirstSheetName = "";
let uploadedSheetData = [];
let enrichedWorkbook = null;
let enrichedFileName = "";

const DB_FIELDS_OPTIONS = [
    { value: "", label: "[Do not fill / None]" },
    { value: "ConsumerName", label: "Customer Name" },
    { value: "MobileNo", label: "Consumer Contact No. (Mobile)" },
    { value: "LpgId", label: "LPG ID" },
    { value: "Address", label: "Address" },
    { value: "Area", label: "Delivery Area" },
    { value: "LastRefillDate", label: "Last Refill Date" },
    { value: "SafetyInspectionDate", label: "Safety Inspection Date" },
    { value: "BankAccountNo", label: "Bank Account Number" },
    { value: "BankIfscCode", label: "IFSC Code" },
    { value: "EKYCFlag", label: "eKYC Status (Y/N)" },
    { value: "TypeOfConnection", label: "Connection Type" },
    { value: "PackageCodeDescription", label: "Package Description" }
];

const FILLABLE_DB_FIELDS = [
    { key: "ConsumerName", label: "Customer Name", defaultCol: "Customer Name" },
    { key: "MobileNo", label: "Consumer Contact No. (Mobile)", defaultCol: "Consumer Contact No." },
    { key: "LpgId", label: "LPG ID", defaultCol: "LPG ID" },
    { key: "Address", label: "Address", defaultCol: "Address" },
    { key: "Area", label: "Delivery Area", defaultCol: "Delivery Area" },
    { key: "LastRefillDate", label: "Last Refill Date", defaultCol: "Last Refill Date" },
    { key: "SafetyInspectionDate", label: "Safety Inspection Date", defaultCol: "Safety Inspection Date" },
    { key: "BankAccountNo", label: "Bank Account Number", defaultCol: "Bank Account Number" },
    { key: "BankIfscCode", label: "IFSC Code", defaultCol: "IFSC Code" },
    { key: "EKYCFlag", label: "eKYC Status (Y/N)", defaultCol: "eKYC Status" },
    { key: "TypeOfConnection", label: "Connection Type", defaultCol: "Connection Type" },
    { key: "PackageCodeDescription", label: "Package Description", defaultCol: "Package Description" }
];

function handleExcelAutoFill(event) {
    const file = event.target.files[0];
    if (!file) return;

    enrichedFileName = `Enriched_${file.name}`;
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const sheetData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

            if (sheetData.length === 0) {
                alert("The Excel/CSV sheet contains no records.");
                return;
            }

            // Save globally for mapping
            uploadedWorkbook = workbook;
            uploadedFirstSheetName = firstSheetName;
            uploadedSheetData = sheetData;

            // Extract headers
            const headers = Object.keys(sheetData[0]);

            // Populate match key select
            const matchKeySelect = document.getElementById("filler-match-key-select");
            matchKeySelect.innerHTML = "";
            headers.forEach(h => {
                const opt = document.createElement("option");
                opt.value = h;
                opt.textContent = h;
                matchKeySelect.appendChild(opt);
            });

            // Auto-detect match key (Consumer No)
            const detectedKey = headers.find(h => {
                const clean = h.trim().toLowerCase().replace(/[\s_\-\.]/g, '');
                return clean.includes("consumerno") || 
                       clean.includes("customerno") || 
                       clean.includes("consumerid") || 
                       clean.includes("customerid") ||
                       clean === "consumerno" ||
                       clean === "customerno";
            }) || headers[0];
            matchKeySelect.value = detectedKey;

            // Populate columns mapping list based on database fields
            const mappingContainer = document.getElementById("filler-columns-mapping-container");
            mappingContainer.innerHTML = "";

            FILLABLE_DB_FIELDS.forEach(field => {
                const rowDiv = document.createElement("div");
                rowDiv.style = "display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items: center; background-color: var(--bg-tertiary); padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid var(--border-color); margin-bottom: 0.25rem;";

                const label = document.createElement("span");
                label.style = "font-size: 0.8rem; font-weight: 600; color: var(--text-main);";
                label.textContent = field.label;

                const select = document.createElement("select");
                select.className = "filler-target-field-select";
                select.setAttribute("data-db-field", field.key);
                select.setAttribute("data-default-col", field.defaultCol);
                select.style = "width: 100%; padding: 0.4rem 0.5rem; background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-main); font-size: 0.85rem; outline: none;";

                // Add None option
                const optNone = document.createElement("option");
                optNone.value = "";
                optNone.textContent = "[Do not fill / None]";
                select.appendChild(optNone);

                // Add Create New Column option
                const optNew = document.createElement("option");
                optNew.value = "__new__";
                optNew.textContent = `[+ Create New Column: "${field.defaultCol}"]`;
                select.appendChild(optNew);

                // Add existing Excel headers
                headers.forEach(h => {
                    const optHeader = document.createElement("option");
                    optHeader.value = h;
                    optHeader.textContent = `Excel Column: "${h}"`;
                    select.appendChild(optHeader);
                });

                // Auto-detect matching Excel column
                const matchedHeader = headers.find(h => {
                    const cleanH = h.trim().toLowerCase().replace(/[\s_\-\.]/g, '');
                    const cleanFieldKey = field.key.toLowerCase();
                    const cleanFieldLabel = field.label.toLowerCase().replace(/[\s_\-\.\(\)]/g, '');
                    const cleanDefaultCol = field.defaultCol.toLowerCase().replace(/[\s_\-\.]/g, '');

                    return cleanH === cleanFieldKey || 
                           cleanH === cleanFieldLabel || 
                           cleanH === cleanDefaultCol ||
                           cleanH.includes(cleanFieldKey) ||
                           cleanFieldKey.includes(cleanH);
                });

                if (matchedHeader) {
                    select.value = matchedHeader;
                } else {
                    // For the most important fields (Customer Name & Mobile), default to "+ Create New Column"
                    if (field.key === "ConsumerName" || field.key === "MobileNo") {
                        select.value = "__new__";
                    } else {
                        select.value = ""; // Default to None
                    }
                }

                rowDiv.appendChild(label);
                rowDiv.appendChild(select);
                mappingContainer.appendChild(rowDiv);
            });

            // Show mapping card & hide results
            document.getElementById("filler-mapping-card").classList.remove("hidden");
            document.getElementById("filler-results-card").classList.add("hidden");

            // Reset file input value
            event.target.value = "";

            if (window.lucide) window.lucide.createIcons();

        } catch (err) {
            console.error("Excel Parsing Error:", err);
            alert("Error parsing the file. Please ensure it is a valid Excel or CSV file.");
        }
    };
    reader.readAsArrayBuffer(file);
}

async function processExcelAutoFill() {
    if (!uploadedSheetData || uploadedSheetData.length === 0) return;

    const matchKeySelect = document.getElementById("filler-match-key-select");
    const consumerNoKey = matchKeySelect.value;

    if (!consumerNoKey) {
        alert("Please select a valid Match Key column.");
        return;
    }

    // Build mapping settings
    const mappings = []; // Array of { dbField, excelCol }
    const selects = document.querySelectorAll(".filler-target-field-select");
    selects.forEach(select => {
        const dbField = select.getAttribute("data-db-field");
        const defaultColName = select.getAttribute("data-default-col");
        const val = select.value;

        if (val === "__new__") {
            mappings.push({ dbField, excelCol: defaultColName });
        } else if (val) {
            mappings.push({ dbField, excelCol: val });
        }
    });

    if (mappings.length === 0) {
        alert("Please map at least one field to fill from the database.");
        return;
    }

    try {
        // Collect all consumer numbers
        const nos = uploadedSheetData
            .map(row => {
                const rawVal = row[consumerNoKey];
                if (rawVal === undefined || rawVal === null) return "";
                return rawVal.toString().trim().replace(/^'/, '');
            })
            .filter(num => num.length > 0 && !isNaN(num));

        if (nos.length === 0) {
            alert("No valid consumer numbers found in the selected Match Key column.");
            return;
        }

        // Search in database
        const matches = await getConsumersByNos(nos);
        const matchMap = new Map();
        matches.forEach(c => {
            matchMap.set(c.ConsumerNo, c);
        });

        let matchedCount = 0;
        let unmatchedCount = 0;

        const updatedData = uploadedSheetData.map(row => {
            const rawVal = row[consumerNoKey];
            const consumerNo = rawVal ? rawVal.toString().trim().replace(/^'/, '') : "";
            const matchedRecord = matchMap.get(consumerNo);

            if (matchedRecord) {
                // Fill all mapped columns
                mappings.forEach(m => {
                    row[m.excelCol] = matchedRecord[m.dbField] || "";
                });
                matchedCount++;
            } else {
                // Leave mapped columns empty
                mappings.forEach(m => {
                    row[m.excelCol] = "";
                });
                unmatchedCount++;
            }
            return row;
        });

        // Create new worksheet and save in workbook
        const newWorksheet = XLSX.utils.json_to_sheet(updatedData);
        uploadedWorkbook.Sheets[uploadedFirstSheetName] = newWorksheet;
        enrichedWorkbook = uploadedWorkbook;

        // Hide mapping card, show results card
        document.getElementById("filler-mapping-card").classList.add("hidden");
        
        // Update stats in UI
        document.getElementById("filler-stat-total").textContent = uploadedSheetData.length.toLocaleString();
        document.getElementById("filler-stat-matched").textContent = matchedCount.toLocaleString();
        document.getElementById("filler-stat-unmatched").textContent = unmatchedCount.toLocaleString();

        document.getElementById("filler-results-card").classList.remove("hidden");

        if (window.lucide) window.lucide.createIcons();

        alert(`Auto-fill complete! Successfully matched and filled details for ${matchedCount} consumers.`);

    } catch (err) {
        console.error("Excel Auto-Filler Processing Error:", err);
        alert("An error occurred during matching and filling. Check database status.");
    }
}

function downloadEnrichedFile() {
    if (!enrichedWorkbook) return;
    XLSX.writeFile(enrichedWorkbook, enrichedFileName);
}

function renderBulkSearchTable(unmatched = []) {
    const tbody = document.getElementById("bulk-results-body");
    const countSummary = document.getElementById("bulk-match-summary");
    const btnExport = document.getElementById("btn-export-excel");
    const btnPrint = document.getElementById("btn-print-bulk");

    const unmatchedContainer = document.getElementById("bulk-unmatched-container");
    const unmatchedCountEl = document.getElementById("bulk-unmatched-count");
    const unmatchedListEl = document.getElementById("bulk-unmatched-list");

    tbody.innerHTML = "";
    
    // Reset the header checkbox to checked when new results are loaded
    document.getElementById("bulk-select-all-checkbox").checked = true;

    // Display unmatched numbers warning if any exist
    if (unmatched && unmatched.length > 0) {
        unmatchedContainer.classList.remove("hidden");
        unmatchedCountEl.textContent = unmatched.length;
        unmatchedListEl.textContent = unmatched.join(", ");
    } else {
        unmatchedContainer.classList.add("hidden");
        unmatchedListEl.textContent = "";
    }

    const count = matchedBulkRecords.length;
    countSummary.textContent = `${count} matches found`;
    countSummary.className = `badge ${count > 0 ? "green" : "red"}`;

    if (count === 0) {
        btnExport.classList.add("hidden");
        btnPrint.classList.add("hidden");
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="table-placeholder">
                    <i data-lucide="search-x"></i>
                    <p>No matching consumers found. Verify that the consumer IDs match exactly.</p>
                </td>
            </tr>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    // Show actions
    btnExport.classList.remove("hidden");
    btnPrint.classList.remove("hidden");

    matchedBulkRecords.forEach((c) => {
        const tr = document.createElement("tr");

        const isEkyc = c.EKYCFlag === "Y";
        const ekycBadge = isEkyc 
            ? '<span class="badge green">Verified</span>' 
            : '<span class="badge red">Unverified</span>';

        const refillDate = c.LastRefillDate || "N/A";
        const daysAgoVal = calculateDaysSince(c.LastRefillDate);
        const daysAgoClass = getRefillStatusClass(c.LastRefillDate);

        tr.innerHTML = `
            <td style="text-align: center;"><input type="checkbox" class="bulk-row-checkbox" data-consumer-no="${escapeHTML(c.ConsumerNo)}" checked></td>
            <td><strong>${escapeHTML(c.ConsumerNo)}</strong></td>
            <td>${escapeHTML(c.ConsumerName)}</td>
            <td>${escapeHTML(c.MobileNo || "N/A")}</td>
            <td>${escapeHTML(c.Area || "N/A")}</td>
            <td>${escapeHTML(c.PackageCodeDescription || "N/A")}</td>
            <td>${escapeHTML(refillDate)}</td>
            <td><span class="days-ago-label ${daysAgoClass}">${escapeHTML(daysAgoVal)}</span></td>
            <td>${ekycBadge}</td>
            <td>
                <button class="btn-row-action" onclick="openConsumerDetails('${escapeHTML(c.ConsumerNo)}')">View Details</button>
            </td>
        `;

        tbody.appendChild(tr);
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function resetBulkSearchTable() {
    matchedBulkRecords = [];
    const tbody = document.getElementById("bulk-results-body");
    tbody.innerHTML = `
        <tr>
            <td colspan="10" class="table-placeholder">
                <i data-lucide="text-cursor-input"></i>
                <p>Provide consumer numbers on the left and click Search</p>
            </td>
        </tr>
    `;
    document.getElementById("bulk-match-summary").textContent = "0 matches found";
    document.getElementById("bulk-match-summary").className = "badge";
    document.getElementById("btn-export-excel").classList.add("hidden");
    document.getElementById("btn-print-bulk").classList.add("hidden");
    
    // Reset unmatched box
    const unmatchedContainer = document.getElementById("bulk-unmatched-container");
    if (unmatchedContainer) {
        unmatchedContainer.classList.add("hidden");
        document.getElementById("bulk-unmatched-list").textContent = "";
    }

    // Reset select-all checkbox
    document.getElementById("bulk-select-all-checkbox").checked = true;

    if (window.lucide) window.lucide.createIcons();
}

// Export Bulk Results to CSV Spreadsheet
function exportBulkCSV() {
    if (matchedBulkRecords.length === 0) return;

    // Get checked consumer numbers from the table
    const checkedNos = new Set(
        Array.from(document.querySelectorAll(".bulk-row-checkbox:checked"))
            .map(cb => cb.getAttribute("data-consumer-no"))
    );
    const recordsToExport = matchedBulkRecords.filter(c => checkedNos.has(c.ConsumerNo));

    if (recordsToExport.length === 0) {
        alert("Please select (check) at least one consumer to download.");
        return;
    }

    // Define columns to output
    const headers = [
        "ConsumerNo", "ConsumerName", "MobileNo", "Email", "AddressLine1", 
        "AddressLine2", "AddressLine3", "PIN", "Area", "Taluka", 
        "PackageCodeDescription", "DepositAmount", "AvgMonthlyConsumption", "EKYCFlag",
        "LastRefillDate", "DaysSinceLastRefill"
    ];

    // Build CSV Content
    let csvRows = [];
    csvRows.push(headers.join(",")); // Header row

    recordsToExport.forEach((c) => {
        const values = headers.map(header => {
            let val = "";
            if (header === "DaysSinceLastRefill") {
                val = calculateDaysSince(c.LastRefillDate);
            } else {
                val = c[header] || "";
            }
            // Format strings containing commas, double quotes, or newlines
            val = val.toString().replace(/"/g, '""');
            if (val.includes(",") || val.includes('"') || val.includes("\n")) {
                val = `"${val}"`;
            }
            return val;
        });
        csvRows.push(values.join(","));
    });

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    link.setAttribute("href", url);
    link.setAttribute("download", `LPG_Consumer_Export_${Date.now()}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Print Bulk Results to PDF format
function printBulkResults() {
    if (matchedBulkRecords.length === 0) return;

    // Get checked consumer numbers from the table
    const checkedNos = new Set(
        Array.from(document.querySelectorAll(".bulk-row-checkbox:checked"))
            .map(cb => cb.getAttribute("data-consumer-no"))
    );
    const recordsToPrint = matchedBulkRecords.filter(c => checkedNos.has(c.ConsumerNo));

    if (recordsToPrint.length === 0) {
        alert("Please select (check) at least one consumer to print.");
        return;
    }

    // Create a temporary container for printing the bulk list
    const printDiv = document.createElement("div");
    printDiv.id = "bulk-print-layout";
    printDiv.innerHTML = `
        <div style="font-family:'Plus Jakarta Sans', sans-serif; padding: 2rem; color: #000000; background: #ffffff;">
            <div style="border-bottom: 2px solid #000; padding-bottom: 1rem; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h1 style="margin: 0; font-size: 1.5rem;">LPG BULK CONSUMER REPORT</h1>
                    <p style="margin: 5px 0 0 0; font-size: 0.8rem; color: #555;">Exported matching query entries</p>
                </div>
                <div style="text-align: right; font-size: 0.8rem;">
                    <div><strong>Date Generated:</strong> ${new Date().toLocaleDateString("en-IN")}</div>
                    <div><strong>Matched Count:</strong> ${recordsToPrint.length} records</div>
                </div>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 0.75rem; text-align: left;">
                <thead>
                    <tr style="border-bottom: 2px solid #000; background-color: #f1f5f9;">
                        <th style="padding: 8px;">Consumer No</th>
                        <th style="padding: 8px;">Name</th>
                        <th style="padding: 8px;">Mobile</th>
                        <th style="padding: 8px;">Area</th>
                        <th style="padding: 8px;">Package Description</th>
                        <th style="padding: 8px;">Last Delivery</th>
                        <th style="padding: 8px;">Days Ago</th>
                        <th style="padding: 8px; text-align: right;">Deposit</th>
                        <th style="padding: 8px; text-align: center;">eKYC</th>
                    </tr>
                </thead>
                <tbody>
                    ${recordsToPrint.map(c => {
                        const depositVal = parseFloat(c.DepositAmount) || 0;
                        const refillDate = c.LastRefillDate || "N/A";
                        const daysAgo = calculateDaysSince(c.LastRefillDate);
                        return `
                            <tr style="border-bottom: 1px solid #cbd5e1;">
                                <td style="padding: 8px; font-weight: bold;">${escapeHTML(c.ConsumerNo)}</td>
                                <td style="padding: 8px;">${escapeHTML(c.ConsumerName)}</td>
                                <td style="padding: 8px;">${escapeHTML(c.MobileNo || "N/A")}</td>
                                <td style="padding: 8px;">${escapeHTML(c.Area || "N/A")}</td>
                                <td style="padding: 8px;">${escapeHTML(c.PackageCodeDescription || "N/A")}</td>
                                <td style="padding: 8px;">${escapeHTML(refillDate)}</td>
                                <td style="padding: 8px;">${escapeHTML(daysAgo)}</td>
                                <td style="padding: 8px; text-align: right;">₹${depositVal.toLocaleString("en-IN")}</td>
                                <td style="padding: 8px; text-align: center; font-weight: bold;">${c.EKYCFlag === 'Y' ? 'YES' : 'NO'}</td>
                            </tr>
                        `;
                    }).join("")}
                </tbody>
            </table>
            <div style="margin-top: 3rem; text-align: center; font-size: 0.7rem; color: #888; border-top: 1px solid #ccc; padding-top: 1rem;">
                This document is a printed list of consumer searches extracted from the digital ledger.
            </div>
        </div>
    `;

    // Append to body, trigger printing via specific print media queries
    document.body.appendChild(printDiv);
    
    // We add a class to the body that overrides global styling for print
    document.body.classList.add("print-active-bulk-only");

    // Add temporary styling inline to hide original app wrapper during print
    const styleEl = document.createElement("style");
    styleEl.innerHTML = `
        @media print {
            body.print-active-bulk-only #app {
                display: none !important;
            }
            body.print-active-bulk-only #bulk-print-layout {
                display: block !important;
                visibility: visible !important;
            }
            body.print-active-bulk-only #bulk-print-layout * {
                visibility: visible !important;
            }
        }
        #bulk-print-layout {
            display: none;
        }
    `;
    document.head.appendChild(styleEl);

    // Call native window print
    window.print();

    // Cleanup print components
    document.body.removeChild(printDiv);
    document.head.removeChild(styleEl);
    document.body.classList.remove("print-active-bulk-only");
}

// ==========================================================================
// 10. Single Profile Details Viewer Modal
// ==========================================================================
async function openConsumerDetails(consumerNo) {
    if (!consumerNo) return;
    
    try {
        const matches = await getConsumersByNos([consumerNo]);
        if (matches.length === 0) {
            alert(`No details found for Consumer No: ${consumerNo}`);
            return;
        }
        
        const c = matches[0];
        
        // 1. Fill personal data
        document.getElementById("detail-no").textContent = c.ConsumerNo;
        document.getElementById("detail-name").textContent = c.ConsumerName;
        document.getElementById("detail-mobile").textContent = c.MobileNo || "N/A";
        document.getElementById("detail-phone").textContent = c.ResidencephoneNo || c.OfficePhoneNo || "N/A";
        document.getElementById("detail-email").textContent = c.Email || "N/A";

        // 2. Fill connection/KYC details
        document.getElementById("detail-conn-type").textContent = c.TypeOfConnection || "N/A";
        document.getElementById("detail-conn-nature").textContent = c.NatureOfConnection || "N/A";
        document.getElementById("detail-avg-consumption").textContent = c.AvgMonthlyConsumption || "0";

        // eKYC Flag
        const flagEl = document.getElementById("detail-ekyc-flag");
        const isVerified = c.EKYCFlag === "Y";
        flagEl.textContent = isVerified ? "VERIFIED (YES)" : "UNVERIFIED (NO)";
        flagEl.className = `badge-ekyc ${isVerified ? 'verified' : 'unverified'}`;
        document.getElementById("detail-ekyc-date").textContent = (isVerified && c.EKYCDate && c.EKYCDate !== "-") ? c.EKYCDate : "N/A";

        // 3. Fill Address
        document.getElementById("detail-addr1").textContent = c.AddressLine1 || "N/A";
        document.getElementById("detail-addr2").textContent = c.AddressLine2 || "N/A";
        document.getElementById("detail-addr3").textContent = c.AddressLine3 || "N/A";
        document.getElementById("detail-pin").textContent = c.PIN || "N/A";
        document.getElementById("detail-area").textContent = c.Area || "N/A";
        document.getElementById("detail-taluka").textContent = c.Taluka || "N/A";

        // 4. Fill Packages/Deposit Table
        document.getElementById("detail-cylinder-code").textContent = c.CylinderPackageCode || "N/A";
        document.getElementById("detail-cylinder-desc").textContent = c.PackageCodeDescription || "N/A";
        document.getElementById("detail-cylinder-qty").textContent = c.CylinderQuantity || "0";
        
        const cylDeposit = parseFloat(c.CylinderDepositAmount) || 0;
        document.getElementById("detail-cylinder-deposit").textContent = `₹${cylDeposit.toLocaleString("en-IN")}`;

        document.getElementById("detail-regulator-code").textContent = c.RegulatorCode || "N/A";
        document.getElementById("detail-regulator-desc").textContent = c.RegulatorCodeDescription || "N/A";
        document.getElementById("detail-regulator-qty").textContent = c.RegulatorQuantity || "0";
        
        const regDeposit = parseFloat(c.RegulatorDepositAmount) || 0;
        document.getElementById("detail-regulator-deposit").textContent = `₹${regDeposit.toLocaleString("en-IN")}`;

        document.getElementById("detail-add-cylinder-qty").textContent = c.AdditionalCylinderQty || "0";

        const grandTotal = parseFloat(c.DepositAmount) || (cylDeposit + regDeposit);
        document.getElementById("detail-total-deposit").textContent = `₹${grandTotal.toLocaleString("en-IN")}`;

        // 5. Fill Audit / Refill Details if they exist
        const auditBlock = document.getElementById("detail-audit-block");
        if (c.LpgId || c.LastRefillDate || c.BankAccountNo) {
            auditBlock.classList.remove("hidden");
            
            document.getElementById("detail-lpg-id").textContent = c.LpgId || "N/A";
            document.getElementById("detail-aadhar").textContent = c.MaskedAadhar || "N/A";
            document.getElementById("detail-refill-date").textContent = c.LastRefillDate || "N/A";
            document.getElementById("detail-refill-source").textContent = c.LastRefillBookingSource || "N/A";
            document.getElementById("detail-subsidy").textContent = c.EligibleForSubsidy === "Y" ? "Yes" : (c.EligibleForSubsidy === "N" ? "No" : (c.EligibleForSubsidy || "N/A"));
            document.getElementById("detail-inspection-status").textContent = c.SafetyInspectionStatus || "N/A";
            document.getElementById("detail-inspection-date").textContent = c.SafetyInspectionDate || "N/A";
            document.getElementById("detail-hose-validity").textContent = c.HoseValidityDate || "N/A";
            document.getElementById("detail-bank-account").textContent = c.BankAccountNo || "N/A";
            document.getElementById("detail-bank-ifsc").textContent = c.BankIfscCode || "N/A";
        } else {
            auditBlock.classList.add("hidden");
        }

        // Set printed dates
        document.querySelectorAll(".current-date-span").forEach(el => {
            el.textContent = new Date().toLocaleDateString("en-IN");
        });

        // Toggle Modal open
        const modal = document.getElementById("detail-modal");
        modal.classList.remove("hidden");

        if (window.lucide) {
            window.lucide.createIcons();
        }
    } catch (e) {
        console.error("Error showing consumer profile:", e);
        alert("Failed to retrieve profile record details.");
    }
}

function closeDetailModal() {
    document.getElementById("detail-modal").classList.add("hidden");
}

// Print single card
function printSingleProfile() {
    window.print();
}

// ==========================================================================
// 11. Core Event Listeners Bindings
// ==========================================================================
function initEventListeners() {
    // Navigation Tabs
    document.querySelectorAll(".nav-item").forEach((btn) => {
        btn.addEventListener("click", handleTabClick);
    });

    // Theme Toggle
    document.getElementById("theme-toggle").addEventListener("click", toggleTheme);

    // Remove Data
    document.getElementById("btn-remove-data").addEventListener("click", removeDataAndReset);

    // File Input selection
    const fileInput = document.getElementById("csv-file-input");
    fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        handleFileUpload(file);
    });

    // Drag and Drop zones
    const dropZone = document.getElementById("drop-zone");
    
    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragover");
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith(".csv")) {
            handleFileUpload(file);
        } else {
            showUploadError("Incorrect file type. Only .csv files are supported.");
        }
    });

    // Quick Search Input typing
    document.getElementById("navbar-quick-search").addEventListener("input", handleQuickSearchInput);

    // Inline Directory filter
    document.getElementById("inline-all-search").addEventListener("input", filterAllConsumers);

    // Pagination controls
    document.getElementById("btn-prev-page").addEventListener("click", () => {
        if (allConsumersCurrentPage > 1) {
            allConsumersCurrentPage--;
            renderAllConsumersTable();
        }
    });

    document.getElementById("btn-next-page").addEventListener("click", () => {
        const totalPages = Math.ceil(filteredConsumers.length / ITEMS_PER_PAGE) || 1;
        if (allConsumersCurrentPage < totalPages) {
            allConsumersCurrentPage++;
            renderAllConsumersTable();
        }
    });

    // Bulk Search events
    document.getElementById("btn-search-bulk").addEventListener("click", performBulkSearch);
    document.getElementById("btn-clear-bulk").addEventListener("click", () => {
        document.getElementById("bulk-input-textarea").value = "";
        resetBulkSearchTable();
    });

    const bulkExcelInput = document.getElementById("bulk-excel-file-input");
    if (bulkExcelInput) {
        bulkExcelInput.addEventListener("change", handleBulkExcelUpload);
    }

    document.getElementById("btn-export-excel").addEventListener("click", exportBulkCSV);
    document.getElementById("btn-print-bulk").addEventListener("click", printBulkResults);

    // Modal Close
    document.getElementById("btn-close-modal").addEventListener("click", closeDetailModal);
    document.getElementById("btn-print-single").addEventListener("click", printSingleProfile);

    // Close Modal on clicking background overlay
    document.getElementById("detail-modal").addEventListener("click", (e) => {
        if (e.target.id === "detail-modal") {
            closeDetailModal();
        }
    });

    // Close on Escape key press
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeDetailModal();
            // Also hide quick search
            document.getElementById("quick-search-results").classList.add("hidden");
        }
    });

    // Select All Checkbox toggler
    const selectAllCb = document.getElementById("bulk-select-all-checkbox");
    if (selectAllCb) {
        selectAllCb.addEventListener("change", (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll(".bulk-row-checkbox").forEach(cb => {
                cb.checked = isChecked;
            });
        });
    }

    // Excel Auto-Filler events
    const fillerUploadZone = document.getElementById("filler-upload-zone");
    const fillerFileInput = document.getElementById("filler-file-input");
    
    if (fillerUploadZone && fillerFileInput) {
        fillerUploadZone.addEventListener("click", () => {
            fillerFileInput.click();
        });

        fillerFileInput.addEventListener("change", handleExcelAutoFill);

        // Drag & Drop for Auto-Filler
        fillerUploadZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            fillerUploadZone.style.border = "2px dashed var(--accent-blue)";
            fillerUploadZone.style.backgroundColor = "rgba(99, 102, 241, 0.05)";
        });

        const resetFillerZoneStyle = () => {
            fillerUploadZone.style.border = "2px dashed var(--border-color)";
            fillerUploadZone.style.backgroundColor = "var(--bg-secondary)";
        };

        fillerUploadZone.addEventListener("dragleave", resetFillerZoneStyle);
        fillerUploadZone.addEventListener("drop", (e) => {
            e.preventDefault();
            resetFillerZoneStyle();
            const file = e.dataTransfer.files[0];
            if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv"))) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                fillerFileInput.files = dataTransfer.files;
                handleExcelAutoFill({ target: fillerFileInput });
            } else {
                alert("Incorrect file type. Please upload a valid Excel or CSV sheet.");
            }
        });
    }

    const btnDownloadEnriched = document.getElementById("btn-download-enriched");
    if (btnDownloadEnriched) {
        btnDownloadEnriched.addEventListener("click", downloadEnrichedFile);
    }

    const btnProcessFiller = document.getElementById("btn-process-filler");
    if (btnProcessFiller) {
        btnProcessFiller.addEventListener("click", processExcelAutoFill);
    }
}

// ==========================================================================
// 12. Helper Utilities
// ==========================================================================
function escapeHTML(str) {
    if (!str) return "";
    return str.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function calculateDaysSince(dateStr) {
    if (!dateStr || dateStr === "-" || dateStr.toLowerCase() === "n/a") return "N/A";
    
    // Parse DD-MM-YYYY or DD/MM/YYYY
    const parts = dateStr.split(/[-/]/);
    if (parts.length !== 3) return "N/A";
    
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed month
    const year = parseInt(parts[2], 10);
    
    const refillDate = new Date(year, month, day);
    const currentDate = new Date();
    
    refillDate.setHours(0, 0, 0, 0);
    currentDate.setHours(0, 0, 0, 0);
    
    const diffTime = currentDate.getTime() - refillDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (isNaN(diffDays)) return "N/A";
    if (diffDays < 0) return "Future date";
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "1 day ago";
    return `${diffDays} days ago`;
}

function getRefillStatusClass(dateStr) {
    if (!dateStr || dateStr === "-" || dateStr.toLowerCase() === "n/a") return "status-na";
    
    const parts = dateStr.split(/[-/]/);
    if (parts.length !== 3) return "status-na";
    
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    
    const refillDate = new Date(year, month, day);
    const currentDate = new Date();
    
    refillDate.setHours(0, 0, 0, 0);
    currentDate.setHours(0, 0, 0, 0);
    
    const diffDays = Math.floor((currentDate.getTime() - refillDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (isNaN(diffDays) || diffDays < 0) return "status-na";
    if (diffDays <= 30) return "refill-recent";  // Under 30 days - Green
    if (diffDays <= 90) return "refill-warn";    // 30-90 days - Amber
    return "refill-stale";                       // Over 90 days - Red
}

function normalizeConsumerRecord(rawRecord) {
    const record = {};
    
    // Normalize keys: trim them and convert to lowercase
    const normalizedKeys = {};
    for (let key in rawRecord) {
        normalizedKeys[key.trim().toLowerCase()] = rawRecord[key];
    }
    
    const getVal = (possibleKeys, defaultVal = "") => {
        for (let pk of possibleKeys) {
            const keyLower = pk.toLowerCase();
            if (normalizedKeys[keyLower] !== undefined && normalizedKeys[keyLower] !== null) {
                return normalizedKeys[keyLower].toString().trim();
            }
        }
        return defaultVal;
    };

    // Extract core identifiers
    record.ConsumerNo = getVal(["consumerno", "consumer no"]);
    record.ConsumerName = getVal(["consumername", "consumer name"]);
    
    // Format Mobile number: remove leading single quotes if present
    record.MobileNo = getVal(["mobileno", "mobile no"]).replace(/^'/, '');
    
    // Area & Location
    record.Area = getVal(["area", "delivery area"]);
    record.Taluka = getVal(["taluka"]);
    record.PIN = getVal(["pin"]);
    
    const addr1 = getVal(["addressline1"]);
    const addr2 = getVal(["addressline2"]);
    const addr3 = getVal(["addressline3"]);
    const fullAddr = getVal(["consumer address"]);
    
    if (fullAddr) {
        record.Address = fullAddr;
        record.AddressLine1 = fullAddr;
        record.AddressLine2 = "";
        record.AddressLine3 = "";
        
        // Extract 6 digit PIN if missing
        const pinMatch = fullAddr.match(/\b\d{6}\b/);
        if (pinMatch && !record.PIN) {
            record.PIN = pinMatch[0];
        }
    } else {
        record.Address = [addr1, addr2, addr3].filter(Boolean).join(", ");
        record.AddressLine1 = addr1;
        record.AddressLine2 = addr2;
        record.AddressLine3 = addr3;
    }
    
    // eKYC Flag normalization (Completed -> Y, Pending -> N)
    const ekycFlag = getVal(["ekycflag"]);
    const ekycStatus = getVal(["ekyc status"]);
    const isKycCompleted = getVal(["is kyc completed"]);
    
    if (ekycFlag) {
        record.EKYCFlag = ekycFlag.toUpperCase() === "Y" ? "Y" : "N";
    } else if (ekycStatus) {
        const statusLower = ekycStatus.toLowerCase();
        record.EKYCFlag = (statusLower === "completed" || statusLower === "y" || statusLower === "yes") ? "Y" : "N";
    } else if (isKycCompleted) {
        record.EKYCFlag = isKycCompleted.toUpperCase() === "Y" ? "Y" : "N";
    } else {
        record.EKYCFlag = "N";
    }
    
    record.EKYCDate = getVal(["ekycdate", "ekyc date"], "-");
    
    // Connection Information
    record.TypeOfConnection = getVal(["typeofconnection", "connection type"]);
    record.NatureOfConnection = getVal(["natureofconnection", "consumer nature"]);
    
    // Cylinder Packages
    record.CylinderPackageCode = getVal(["cylinderpackagecode"]);
    record.PackageCodeDescription = getVal(["packagecodedescription", "package code description"]);
    
    // Fallback: If no cylinder package code description but we have TypeOfConnection/Connection Type
    if (!record.PackageCodeDescription && record.TypeOfConnection) {
        record.PackageCodeDescription = record.TypeOfConnection;
    }
    
    record.CylinderQuantity = parseInt(getVal(["cylinderquantity"])) || 0;
    record.CylinderDepositAmount = parseFloat(getVal(["cylinderdepositamount"])) || 0;
    
    record.RegulatorCode = getVal(["regulatorcode"]);
    record.RegulatorCodeDescription = getVal(["regulatorcodedescription"]);
    record.RegulatorQuantity = parseInt(getVal(["regulatorquantity"])) || 0;
    record.RegulatorDepositAmount = parseFloat(getVal(["regulatordepositamount"])) || 0;
    record.AdditionalCylinderQty = parseInt(getVal(["additionalcylinderqty"])) || 0;
    
    // Deposits
    record.DepositAmount = parseFloat(getVal(["depositamount"])) || 0;
    if (record.DepositAmount === 0) {
        record.DepositAmount = record.CylinderDepositAmount + record.RegulatorDepositAmount;
    }
    
    record.AvgMonthlyConsumption = parseInt(getVal(["avgmonthlyconsumption"])) || 0;
    
    // Second format specific fields
    record.LpgId = getVal(["lpg id", "lpgid"]);
    record.ConsumerStatus = getVal(["consumer status", "consumerstatus"], "Active");
    record.LastRefillDate = getVal(["lastrefilldate", "last refill date"]);
    record.LastRefillBookingSource = getVal(["last refill bookingsource", "lastrefillbookingsource"]);
    record.EligibleForSubsidy = getVal(["eligible for subsidy", "eligibleforsubsidy"]);
    record.SafetyInspectionStatus = getVal(["safety inspection status", "safetyinspectionstatus"]);
    record.SafetyInspectionDate = getVal(["safety inspection date", "safetyinspectiondate"]);
    record.HoseValidityDate = getVal(["hose validity date", "hosevaliditydate"]);
    record.BankAccountNo = getVal(["bankaccountno", "bank account no"]);
    record.BankIfscCode = getVal(["bankifsccode", "bank ifsc code"]);
    record.MaskedAadhar = getVal(["maskedaadhar", "masked aadhar"]);
    record.SvDate = getVal(["sv date", "svdate"]);
    
    return record;
}
