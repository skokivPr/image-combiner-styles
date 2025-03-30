/* Image Combiner Pro - enhanced-spreadsheet.js
 * Version: 1.0.1
 * Author: skoki
 * GitHub: https://github.com/skokivPr
 */

// Constants
const VEHICLE_TYPES = {
    TRACTOR: 'tractor',
    TRAILER: 'trailer',
    BOTH: 'both',
    ALL: 'all'
};

// Constants
const TABLE1_COLUMNS = ["Date UTC", "User ID", "License Plate", "Tractor", "Visit Reason", "Trailer"];
const TABLE2_COLUMNS = ["Date UTC", "User ID", "VRID", "SCAC", "Tractor", "Trailer"];

// Keyboard Shortcuts
const KEYBOARD_SHORTCUTS = {
    'ctrl+f': () => document.getElementById('searchInput').focus(),
    'ctrl+c': () => document.getElementById('showChartsBtn').click(),
    'ctrl+r': () => generateReport(),
    'ctrl+e': () => showExportOptions(),
    'ctrl+t': () => toggleTheme(),
    'ctrl+h': () => toggleKeyboardShortcuts()
};

// Table Configuration
const TABLE_CONFIG = {
    rowHeaders: true,
    colHeaders: true,
    filters: true,
    dropdownMenu: true,
    contextMenu: true,
    multiColumnSorting: true,
    licenseKey: 'non-commercial-and-evaluation',
    height: '100%',
    stretchH: 'all',
    autoWrapRow: true,
    autoWrapCol: true,
    className: 'htMiddle',
    cells(row, col, prop) {
        const cellProperties = {};

        // Check if this is a Trailer column
        if (prop === 'Trailer') {
            const value = this.instance.getDataAtCell(row, col);
            if (value && typeof value === 'string') {
                // Split by newlines to check each trailer
                const trailers = value.split('\n');
                const hasVSTrailer = trailers.some(trailer =>
                    trailer.trim().toUpperCase().startsWith('VS')
                );
                const hasRTrailer = trailers.some(trailer =>
                    trailer.trim().toUpperCase().startsWith('R')
                );

                if (hasVSTrailer) {
                    cellProperties.className = 'vs-trailer';
                } else if (hasRTrailer) {
                    cellProperties.className = 'r-trailer';
                }
            }
        }

        // Check if this is a SCAC column
        if (prop === 'SCAC') {
            const value = this.instance.getDataAtCell(row, col);
            if (!value || value.trim() === '') {
                cellProperties.className = 'missing-scac';
                cellProperties.title = 'Missing SCAC';
            }
        }

        return cellProperties;
    }
};

// State Management
const state = {
    table1Data: [],
    table2Data: [],
    hot1: null,
    hot2: null,
    charts: {},
    filters: {
        viewMode: 'default'
    },
    validationResults: {
        errors: [],
        warnings: [],
        cleaned: []
    },
    analysis: {
        trendChart: null,
        lastUpdate: null
    }
};

// Utility Functions
const utils = {
    splitVehicleNumber: (vehicleNumber) => {
        if (!vehicleNumber) return ['', ''];

        // Clean up the input
        const cleanValue = vehicleNumber.trim().replace(/\s+/g, ' ');

        // Common trailer patterns
        const trailerPatterns = [
            /^[A-Z0-9]{4,8}$/i,  // Standard trailer format
            /^[A-Z]{2,3}\d{4,6}$/i,  // SCAC + number format
            /^[A-Z]{2,3}\d{4,6}[A-Z]?$/i,  // SCAC + number + optional letter
            /^\d{4,6}[A-Z]{2,3}$/i  // Number + SCAC format
        ];

        // Common tractor patterns
        const tractorPatterns = [
            /^[A-Z]{3}\d{5}$/i,  // Format like DPL39290
            /^[A-Z]{2,3}\d{4,6}$/i,  // SCAC + number format
            /^\d{3,4}[A-Z]{2,3}$/i,  // Number + SCAC format
            /^[A-Z0-9]{4,6}$/i  // Standard tractor format
        ];

        const identifyVehicleType = (value) => {
            const isTrailer = trailerPatterns.some(pattern => pattern.test(value));
            const isTractor = tractorPatterns.some(pattern => pattern.test(value));
            return { isTrailer, isTractor };
        };

        const splitParts = (value, separator) => {
            const parts = value.split(separator).map(p => p.trim()).filter(p => p);
            if (parts.length < 2) return null;

            const firstType = identifyVehicleType(parts[0]);
            const secondType = identifyVehicleType(parts[1]);

            if (firstType.isTrailer && !secondType.isTrailer) return ['', parts[0]];
            if (!firstType.isTrailer && secondType.isTrailer) return [parts[0], parts[1]];
            if (firstType.isTractor && !secondType.isTractor) return [parts[0], ''];
            if (!firstType.isTractor && secondType.isTractor) return ['', parts[1]];
            return [parts[0], parts[1]];
        };

        const trySplitBySeparator = (value, separator) => {
            if (!value.includes(separator)) return null;
            return splitParts(value, separator);
        };

        const trySplitByNewlines = (value) => {
            return splitParts(value, '\n');
        };

        const trySplitBySpace = (value) => {
            return splitParts(value, ' ');
        };

        const trySplitByCommonSeparators = (value) => {
            const separators = ['/', '\\', '|', '-', '_'];
            for (const sep of separators) {
                const result = trySplitBySeparator(value, sep);
                if (result) return result;
            }
            return null;
        };

        const identifySingleVehicle = (value) => {
            const type = identifyVehicleType(value);
            if (type.isTrailer) return ['', value];
            if (type.isTractor) return [value, ''];
            return null;
        };

        // Try each splitting method in order
        const methods = [
            trySplitByNewlines,
            trySplitByCommonSeparators,
            trySplitBySpace,
            identifySingleVehicle
        ];

        for (const method of methods) {
            const result = method(cleanValue);
            if (result) return result;
        }

        // If no method worked, return the value as tractor and empty trailer
        return [cleanValue, ''];
    },

    createEmptyRow: (columns) => {
        return Array(columns.length).fill('');
    },

    formatDate: (date) => {
        try {
            const parsedDate = new Date(date);
            if (isNaN(parsedDate.getTime())) {
                return date; // Return original value if invalid date
            }
            return parsedDate.toISOString();
        } catch (error) {
            return date; // Return original value if error occurs
        }
    },

    matchesFilters: (row, viewMode) => {
        return true; // Always return true since we removed filters
    },

    getVehicleType: (row) => {
        const hasTractor = row["Tractor"] && row["Tractor"].split('\n').some(t => t.trim());
        const hasTrailer = row["Trailer"] && row["Trailer"].split('\n').some(t => t.trim());

        if (hasTractor && hasTrailer) return VEHICLE_TYPES.BOTH;
        if (hasTractor) return VEHICLE_TYPES.TRACTOR;
        if (hasTrailer) return VEHICLE_TYPES.TRAILER;
        return null;
    },

    processVehicleData: (row) => {
        // Handle the specific CSV format
        if (row["Vehicle Type"] === "Tractor" && row["Vehicle #"]) {
            return [row["Vehicle #"], '', row["SCAC"] || ''];
        }

        const vehicleNumber = row["Vehicle #"];
        const [tractor, trailer] = utils.splitVehicleNumber(vehicleNumber);

        // Additional validation and cleanup
        const cleanTractor = tractor ? tractor.trim().toUpperCase() : '';
        const cleanTrailer = trailer ? trailer.trim().toUpperCase() : '';

        // Extract SCAC if present in vehicle numbers
        let scac = row["SCAC"] || '';
        if (!scac && cleanTrailer) {
            const scacMatch = cleanTrailer.match(/^[A-Z]{2,3}/);
            if (scacMatch) {
                scac = scacMatch[0];
            }
        }
        if (!scac && cleanTractor) {
            const scacMatch = cleanTractor.match(/^[A-Z]{2,3}/);
            if (scacMatch) {
                scac = scacMatch[0];
            }
        }

        // Special handling for DPL format tractors
        if (cleanTractor && /^[A-Z]{3}[0,9]{5}$/i.test(cleanTractor)) {
            scac = cleanTractor.substring(0, 3);
        }

        return [cleanTractor, cleanTrailer, scac];
    },

    validateData: (data) => {
        const errors = [];
        const warnings = [];

        data.forEach((row, index) => {
            // Validate Date
            if (!row["Date UTC"] || isNaN(new Date(row["Date UTC"]).getTime())) {
                errors.push(`Row ${index + 1}: Invalid date format`);
            }

            // Validate User ID
            if (!row["User ID"] || row["User ID"].trim() === '') {
                errors.push(`Row ${index + 1}: Missing User ID`);
            }

            // Validate Vehicle Numbers
            if (row["Tractor"] && !utils.isValidTractor(row["Tractor"])) {
                warnings.push(`Row ${index + 1}: Invalid tractor number format`);
            }
            if (row["Trailer"] && !utils.isValidTrailer(row["Trailer"])) {
                warnings.push(`Row ${index + 1}: Invalid trailer number format`);
            }

            // Validate SCAC
            if (row["SCAC"] && !utils.isValidSCAC(row["SCAC"])) {
                warnings.push(`Row ${index + 1}: Invalid SCAC code`);
            }
        });

        return { errors, warnings };
    },

    cleanData: (data) => {
        return data.map(row => ({
            ...row,
            "Date UTC": utils.formatDate(row["Date UTC"]),
            "User ID": row["User ID"]?.trim(),
            "Tractor": row["Tractor"]?.trim().toUpperCase(),
            "Trailer": row["Trailer"]?.trim().toUpperCase(),
            "SCAC": row["SCAC"]?.trim().toUpperCase()
        }));
    },

    isValidTractor: (tractor) => {
        const patterns = [
            /^[A-Z]{3}\d{5}$/i,
            /^[A-Z]{2,3}\d{4,6}$/i,
            /^\d{3,4}[A-Z]{2,3}$/i,
            /^[A-Z0-9]{4,6}$/i
        ];
        return patterns.some(pattern => pattern.test(tractor));
    },

    isValidTrailer: (trailer) => {
        const patterns = [
            /^[A-Z0-9]{4,8}$/i,
            /^[A-Z]{2,3}\d{4,6}$/i,
            /^[A-Z]{2,3}\d{4,6}[A-Z]?$/i,
            /^\d{4,6}[A-Z]{2,3}$/i
        ];
        return patterns.some(pattern => pattern.test(trailer));
    },

    isValidSCAC: (scac) => {
        return /^[A-Z]{2,4}$/i.test(scac);
    },

    generateReport: () => {
        const report = {
            summary: {
                totalRecords: state.table1Data.length,
                uniqueUsers: new Set(state.table1Data.map(row => row["User ID"])).size,
                dateRange: {
                    start: new Date(Math.min(...state.table1Data.map(row => new Date(row["Date UTC"])))),
                    end: new Date(Math.max(...state.table1Data.map(row => new Date(row["Date UTC"]))))
                }
            },
            dataQuality: {
                validDates: state.table1Data.filter(row => !isNaN(new Date(row["Date UTC"]).getTime())).length,
                validTractors: state.table1Data.filter(row => utils.isValidTractor(row["Tractor"])).length,
                validTrailers: state.table1Data.filter(row => utils.isValidTrailer(row["Trailer"])).length
            },
            vehicleDistribution: {
                tractors: new Set(state.table1Data.flatMap(row => row["Tractor"].split('\n'))).size,
                trailers: new Set(state.table1Data.flatMap(row => row["Trailer"].split('\n'))).size
            },
            timeAnalysis: {
                hourlyDistribution: Array(24).fill(0).map((_, hour) => ({
                    hour,
                    count: state.table1Data.filter(row => new Date(row["Date UTC"]).getHours() === hour).length
                }))
            }
        };

        return report;
    },

    exportToExcel: (data, filename) => {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
        XLSX.writeFile(wb, filename.replace('.excel', '.xlsx'));
    },

    exportToPDF: (data, filename) => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const table = doc.autoTable({
            head: [Object.keys(data[0])],
            body: data.map(row => Object.values(row)),
            theme: 'grid'
        });
        doc.save(filename);
    },

    exportToHTML: (data, filename) => {
        // Create HTML table
        const tableHtml = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <title>${filename}</title>
                        <style>
                            table { border-collapse: collapse; width: 100%; }
                            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                            th { background-color: #f2f2f2; }
                            tr:nth-child(even) { background-color: #f9f9f9; }
                            tr:hover { background-color: #f5f5f5; }
                        </style>
                    </head>
                    <body>
                        <table>
                            <thead>
                                <tr>${Object.keys(data[0]).map(key => `<th>${key}</th>`).join('')}</tr>
                            </thead>
                            <tbody>
                                ${data.map(row => `
                                    <tr>${Object.values(row).map(value => `<td>${value}</td>`).join('')}</tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </body>
                    </html>
                `;

        // Create and trigger download
        const blob = new Blob([tableHtml], { type: 'text/html;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    calculateDataQuality: (data) => {
        const totalRecords = data.length;
        if (totalRecords === 0) return { valid: 0, missing: 0, errors: 0 };

        const validRecords = data.filter(row =>
            row["Date UTC"] &&
            row["User ID"] &&
            (row["Tractor"] || row["Trailer"])
        ).length;

        const missingData = data.filter(row =>
            !row["Date UTC"] ||
            !row["User ID"]
        ).length;

        const errors = data.filter(row =>
            row["Date UTC"] && isNaN(new Date(row["Date UTC"]).getTime())
        ).length;

        return {
            valid: (validRecords / totalRecords) * 100,
            missing: (missingData / totalRecords) * 100,
            errors
        };
    },

    updateAnalysis: () => {
        // Update Data Overview
        const totalRecords = state.table1Data.length;
        const uniqueUsers = new Set(state.table1Data.map(row => row["User ID"])).size;
        const dateRange = {
            start: new Date(Math.min(...state.table1Data.map(row => new Date(row["Date UTC"])))),
            end: new Date(Math.max(...state.table1Data.map(row => new Date(row["Date UTC"]))))
        };

        document.querySelector('#dataOverview .stat-item:nth-child(1) .stat-value').textContent = totalRecords;
        document.querySelector('#dataOverview .stat-item:nth-child(2) .stat-value').textContent = uniqueUsers;
        document.querySelector('#dataOverview .stat-item:nth-child(3) .stat-value').textContent =
            `${dateRange.start.toLocaleDateString()} - ${dateRange.end.toLocaleDateString()}`;

        // Update Vehicle Statistics
        const tractors = new Set(state.table1Data.flatMap(row => row["Tractor"].split('\n'))).size;
        const trailers = new Set(state.table1Data.flatMap(row => row["Trailer"].split('\n'))).size;
        const vsTrailers = state.table1Data.filter(row =>
            row["Trailer"].split('\n').some(t => t.trim().toUpperCase().startsWith('VS'))
        ).length;

        document.querySelector('#vehicleStats .stat-item:nth-child(1) .stat-value').textContent = tractors;
        document.querySelector('#vehicleStats .stat-item:nth-child(2) .stat-value').textContent = trailers;
        document.querySelector('#vehicleStats .stat-item:nth-child(3) .stat-value').textContent = vsTrailers;

        // Update Data Quality
        const quality = utils.calculateDataQuality(state.table1Data);
        document.querySelector('#dataQuality .stat-item:nth-child(1) .stat-value').textContent = `${quality.valid.toFixed(1)}%`;
        document.querySelector('#dataQuality .stat-item:nth-child(2) .stat-value').textContent = `${quality.missing.toFixed(1)}%`;
        document.querySelector('#dataQuality .stat-item:nth-child(3) .stat-value').textContent = quality.errors;

        // Update Activity Trends Chart
        const dailyActivity = {};
        state.table1Data.forEach(row => {
            const date = new Date(row["Date UTC"]).toLocaleDateString();
            dailyActivity[date] = (dailyActivity[date] || 0) + 1;
        });

        if (state.analysis.trendChart) {
            state.analysis.trendChart.destroy();
        }

        const ctx = document.getElementById('trendChart').getContext('2d');
        state.analysis.trendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Object.keys(dailyActivity),
                datasets: [{
                    label: 'Daily Activity',
                    data: Object.values(dailyActivity),
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1,
                    fill: true,
                    backgroundColor: 'rgba(75, 192, 192, 0.2)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true
                    },
                    title: {
                        display: true,
                        text: 'Activity Trends'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });

        state.analysis.lastUpdate = new Date();
    }
};

// Table Operations
const tableOperations = {
    initializeTables: () => {
        state.hot1 = new Handsontable(document.getElementById('hot1'), {
            ...TABLE_CONFIG,
            data: [utils.createEmptyRow(TABLE1_COLUMNS)],
            columns: TABLE1_COLUMNS.map(col => ({ title: col, data: col }))
        });

        state.hot2 = new Handsontable(document.getElementById('hot2'), {
            ...TABLE_CONFIG,
            data: [utils.createEmptyRow(TABLE2_COLUMNS)],
            columns: TABLE2_COLUMNS.map(col => ({ title: col, data: col }))
        });
    },

    processData: (data) => {
        const table1Map = new Map();
        const table2Map = new Map();

        const processRow = (row) => {
            if (!row["Date UTC"] || !row["User ID"]) {
                return;
            }

            const key = `${row["Date UTC"]}_${row["User ID"]}`;
            const [tractor, trailer, extractedScac] = utils.processVehicleData(row);

            processTable1Data(table1Map, key, row, tractor, trailer);
            processTable2Data(table2Map, key, row, tractor, trailer, extractedScac);
        };

        const processTable1Data = (map, key, row, tractor, trailer) => {
            if (!map.has(key)) {
                map.set(key, {
                    "Date UTC": row["Date UTC"],
                    "User ID": row["User ID"],
                    "License Plate": row["License Plate"] || "",
                    "Tractor": new Set(),
                    "Visit Reason": row["Visit Reason"] || "",
                    "Trailer": new Set()
                });
            }

            addVehicleIfValid(map.get(key)["Tractor"], tractor);
            addVehicleIfValid(map.get(key)["Trailer"], trailer);
        };

        const processTable2Data = (map, key, row, tractor, trailer, extractedScac) => {
            if (!map.has(key)) {
                map.set(key, {
                    "Date UTC": row["Date UTC"],
                    "User ID": row["User ID"],
                    "VRID": new Set(),
                    "SCAC": new Set(),
                    "Tractor": new Set(),
                    "Trailer": new Set()
                });
            }

            addDataIfValid(map.get(key)["VRID"], row["VRID"]);
            addDataIfValid(map.get(key)["VRID"], row["ISA"]);
            addDataIfValid(map.get(key)["SCAC"], row["SCAC"]);
            addDataIfValid(map.get(key)["SCAC"], extractedScac);
            addVehicleIfValid(map.get(key)["Tractor"], tractor);
            addVehicleIfValid(map.get(key)["Trailer"], trailer);
        };

        const addVehicleIfValid = (set, value) => {
            if (value && value.trim()) {
                set.add(value.trim());
            }
        };

        const addDataIfValid = (set, value) => {
            if (!value) return;
            const cleanValue = value.trim();
            if (cleanValue && !set.has(cleanValue)) {
                set.add(cleanValue);
            }
        };

        const convertMapToArray = (map, format) => {
            return Array.from(map.values()).map(row => ({
                ...row,
                ...format(row)
            }));
        };

        // Process each row
        data.forEach(processRow);

        // Convert maps to arrays and format data
        state.table1Data = convertMapToArray(table1Map, row => ({
            "Tractor": Array.from(row["Tractor"]).join("\n"),
            "Trailer": Array.from(row["Trailer"]).join("\n")
        }));

        state.table2Data = convertMapToArray(table2Map, row => ({
            "VRID": Array.from(row["VRID"]).join("\n"),
            "SCAC": Array.from(row["SCAC"]).join("\n"),
            "Tractor": Array.from(row["Tractor"]).join("\n"),
            "Trailer": Array.from(row["Trailer"]).join("\n")
        }));

        // Update tables
        state.hot1.loadData(state.table1Data);
        state.hot2.loadData(state.table2Data);

        // Update analysis
        utils.updateAnalysis();

        Swal.fire({
            icon: 'success',
            title: 'Success',
            text: 'Data loaded successfully!'
        });
    }
};

// Event Handlers
const eventHandlers = {
    handleFileUpload: (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            Papa.parse(e.target.result, {
                header: true,
                complete: (results) => tableOperations.processData(results.data),
                error: (error) => {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'Failed to parse CSV file: ' + error.message
                    });
                }
            });
        };
        reader.readAsText(file);
    },

    handleSearch: (query) => {
        if (!query) {
            state.hot1.loadData(state.table1Data);
            state.hot2.loadData(state.table2Data);
            return;
        }

        const searchQuery = query.toLowerCase();
        const filterData = (data) => data.filter(row =>
            Object.values(row).some(value =>
                String(value).toLowerCase().includes(searchQuery)
            )
        );

        state.hot1.loadData(filterData(state.table1Data));
        state.hot2.loadData(filterData(state.table2Data));
    },

    handleValidateData: () => {
        const table1Validation = utils.validateData(state.table1Data);
        const table2Validation = utils.validateData(state.table2Data);

        state.validationResults = {
            errors: [...table1Validation.errors, ...table2Validation.errors],
            warnings: [...table1Validation.warnings, ...table2Validation.warnings]
        };

        // Apply validation styling
        state.hot1.updateSettings({
            cells(row, col, prop) {
                const cellProperties = {};
                const rowData = state.hot1.getDataAtRow(row);
                const validation = utils.validateData([rowData]);

                if (validation.errors && validation.errors.length > 0) {
                    cellProperties.className = 'validation-error';
                } else if (validation.warnings && validation.warnings.length > 0) {
                    cellProperties.className = 'validation-warning';
                } else {
                    cellProperties.className = 'validation-success';
                }

                return cellProperties;
            }
        });

        Swal.fire({
            icon: 'info',
            title: 'Data Validation Complete',
            html: `
                        <p>Errors: ${state.validationResults.errors.length}</p>
                        <p>Warnings: ${state.validationResults.warnings.length}</p>
                    `
        });
    },

    handleViewModeChange: (mode) => {
        const container = document.querySelector('.tables-container');
        container.className = `tables-container view-mode-${mode}`;
        state.filters.viewMode = mode;
    },

    handleExport: (format, filename) => {
        const data = filename.startsWith('table1') ? state.table1Data : state.table2Data;

        switch (format) {
            case 'excel':
                utils.exportToExcel(data, filename);
                break;
            case 'pdf':
                utils.exportToPDF(data, filename);
                break;
            case 'html':
                utils.exportToHTML(data, filename);
                break;
        }
    },

    handleGenerateReport: () => {
        const report = utils.generateReport();
        const reportContainer = document.getElementById('reportContainer');
        const reportOverlay = document.getElementById('reportOverlay');

        // Populate report sections
        document.getElementById('summaryStats').innerHTML = `
                    <p>Total Records: ${report.summary.totalRecords}</p>
                    <p>Unique Users: ${report.summary.uniqueUsers}</p>
                    <p>Date Range: ${report.summary.dateRange.start.toLocaleDateString()} - ${report.summary.dateRange.end.toLocaleDateString()}</p>
                `;

        document.getElementById('dataQuality').innerHTML = `
                    <p>Valid Dates: ${report.dataQuality.validDates}</p>
                    <p>Valid Tractors: ${report.dataQuality.validTractors}</p>
                    <p>Valid Trailers: ${report.dataQuality.validTrailers}</p>
                `;

        document.getElementById('vehicleDistribution').innerHTML = `
                    <p>Unique Tractors: ${report.vehicleDistribution.tractors}</p>
                    <p>Unique Trailers: ${report.vehicleDistribution.trailers}</p>
                `;

        document.getElementById('timeAnalysis').innerHTML = `
                    <table class="report-table">
                        <tr>
                            <th>Hour</th>
                            <th>Count</th>
                        </tr>
                        ${report.timeAnalysis.hourlyDistribution.map(hour => `
                            <tr>
                                <td>${hour.hour}:00</td>
                                <td>${hour.count}</td>
                            </tr>
                        `).join('')}
                    </table>
                `;

        reportContainer.style.display = 'block';
        reportOverlay.style.display = 'block';
    },

    initialize: () => {
        // ... existing initialization ...

        // Add Analysis section event listeners
        document.getElementById('refreshAnalysisBtn').addEventListener('click', () => {
            utils.updateAnalysis();
            Swal.fire({
                icon: 'success',
                title: 'Analysis Updated',
                text: 'Data analysis has been refreshed successfully!'
            });
        });

        document.getElementById('exportAnalysisBtn').addEventListener('click', () => {
            const analysisData = {
                overview: {
                    totalRecords: state.table1Data.length,
                    uniqueUsers: new Set(state.table1Data.map(row => row["User ID"])).size,
                    dateRange: {
                        start: new Date(Math.min(...state.table1Data.map(row => new Date(row["Date UTC"])))),
                        end: new Date(Math.max(...state.table1Data.map(row => new Date(row["Date UTC"]))))
                    }
                },
                vehicles: {
                    tractors: new Set(state.table1Data.flatMap(row => row["Tractor"].split('\n'))).size,
                    trailers: new Set(state.table1Data.flatMap(row => row["Trailer"].split('\n'))).size,
                    vsTrailers: state.table1Data.filter(row =>
                        row["Trailer"].split('\n').some(t => t.trim().toUpperCase().startsWith('VS'))
                    ).length
                },
                quality: utils.calculateDataQuality(state.table1Data)
            };

            const filename = `analysis_${new Date().toISOString().split('T')[0]}.json`;
            const blob = new Blob([JSON.stringify(analysisData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    tableOperations.initializeTables();
    initializeTheme();

    // Event Listeners
    document.getElementById('csvFileInput').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            eventHandlers.handleFileUpload(e.target.files[0]);
        }
    });

    document.getElementById('searchInput').addEventListener('input', (e) => {
        eventHandlers.handleSearch(e.target.value);
    });

    document.getElementById('validateDataBtn').addEventListener('click', eventHandlers.handleValidateData);
    document.getElementById('refreshTableBtn').addEventListener('click', () => {
        state.hot1.loadData(state.table1Data);
        state.hot2.loadData(state.table2Data);
        Swal.fire({
            icon: 'success',
            title: 'Tables Refreshed',
            text: 'Tables have been refreshed successfully!'
        });
    });
    document.getElementById('viewMode').addEventListener('change', (e) => {
        eventHandlers.handleViewModeChange(e.target.value);
    });
    document.getElementById('exportBtn1').addEventListener('click', () => {
        const data = state.table1Data;
        const filename = `table1_export_${new Date().toISOString().split('T')[0]}`;

        Swal.fire({
            title: 'Export Table 1',
            html: `
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <button class="btn btn-primary" onclick="exportToExcel('${filename}')">
                                <i class="bi bi-file-earmark-excel"></i> Export as Excel
                            </button>
                            <button class="btn btn-primary" onclick="exportToPDF('${filename}')">
                                <i class="bi bi-file-earmark-pdf"></i> Export as PDF
                            </button>
                            <button class="btn btn-primary" onclick="exportToHTML('${filename}')">
                                <i class="bi bi-file-earmark-code"></i> Export as HTML
                            </button>
                        </div>
                    `,
            showConfirmButton: false
        });
    });

    document.getElementById('exportBtn2').addEventListener('click', () => {
        const data = state.table2Data;
        const filename = `table2_export_${new Date().toISOString().split('T')[0]}`;

        Swal.fire({
            title: 'Export Table 2',
            html: `
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <button class="btn btn-primary" onclick="exportToExcel('${filename}')">
                                <i class="bi bi-file-earmark-excel"></i> Export as Excel
                            </button>
                            <button class="btn btn-primary" onclick="exportToPDF('${filename}')">
                                <i class="bi bi-file-earmark-pdf"></i> Export as PDF
                            </button>
                            <button class="btn btn-primary" onclick="exportToHTML('${filename}')">
                                <i class="bi bi-file-earmark-code"></i> Export as HTML
                            </button>
                        </div>
                    `,
            showConfirmButton: false
        });
    });

    document.getElementById('generateReportBtn').addEventListener('click', eventHandlers.handleGenerateReport);

    // Add Analysis section event listeners
    eventHandlers.initialize();
});

// Theme handling
function initializeTheme() {
    const themeToggle = document.getElementById('themeToggle');
    const root = document.documentElement;

    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

    root.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    themeToggle.addEventListener('click', () => {
        const currentTheme = root.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        root.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
    });
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('#themeToggle i');
    icon.className = theme === 'dark' ? 'bi bi-moon' : 'bi bi-sun';
}

// Chart generation
function generateCharts() {
    if (!state.table1Data.length || !state.table2Data.length) {
        Swal.fire({
            icon: 'warning',
            title: 'No Data',
            text: 'Please upload data first!'
        });
        return;
    }

    const chartContainer = document.getElementById('chartContainer');
    chartContainer.style.display = 'grid';

    // Visit Reasons Distribution
    const visitReasons = {};
    state.table1Data.forEach(row => {
        const reason = row["Visit Reason"] || "Unknown";
        visitReasons[reason] = (visitReasons[reason] || 0) + 1;
    });

    const chart1 = new Chart(document.getElementById('chart1'), {
        type: 'bar',
        data: {
            labels: Object.keys(visitReasons),
            datasets: [{
                data: Object.values(visitReasons),
                backgroundColor: Object.keys(visitReasons).map((_, i) =>
                    `hsl(${360 * i / Object.keys(visitReasons).length}, 70%, 60%)`
                ),
                label: 'Number of Visits'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Visit Reasons Distribution'
                },
                legend: {
                    display: true
                }
            }
        }
    });

    // SCAC Distribution
    const scacDistribution = {};
    state.table2Data.forEach(row => {
        const scac = row["SCAC"] || "Unknown";
        scacDistribution[scac] = (scacDistribution[scac] || 0) + 1;
    });

    const chart2 = new Chart(document.getElementById('chart2'), {
        type: 'bar',
        data: {
            labels: Object.keys(scacDistribution),
            datasets: [{
                data: Object.values(scacDistribution),
                backgroundColor: Object.keys(scacDistribution).map((_, i) =>
                    `hsl(${360 * i / Object.keys(scacDistribution).length}, 70%, 60%)`
                ),
                label: 'Number of Entries'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'SCAC Distribution'
                },
                legend: {
                    display: true
                }
            }
        }
    });

    // User ID Distribution
    const userIdDistribution = {};
    state.table1Data.forEach(row => {
        const userId = row["User ID"] || "Unknown";
        userIdDistribution[userId] = (userIdDistribution[userId] || 0) + 1;
    });

    const chart3 = new Chart(document.getElementById('chart3'), {
        type: 'bar',
        data: {
            labels: Object.keys(userIdDistribution),
            datasets: [{
                data: Object.values(userIdDistribution),
                backgroundColor: Object.keys(userIdDistribution).map((_, i) =>
                    `hsl(${360 * i / Object.keys(userIdDistribution).length}, 70%, 60%)`
                ),
                label: 'Number of Activities'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'User ID Distribution'
                },
                legend: {
                    display: true
                }
            }
        }
    });

    // Hourly Distribution
    const hourlyDistribution = Array(24).fill(0);
    state.table1Data.forEach(row => {
        const date = new Date(row["Date UTC"]);
        hourlyDistribution[date.getHours()]++;
    });

    const chart4 = new Chart(document.getElementById('chart4'), {
        type: 'line',
        data: {
            labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
            datasets: [{
                data: hourlyDistribution,
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1,
                label: 'Number of Visits',
                fill: true,
                backgroundColor: 'rgba(75, 192, 192, 0.2)'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Visits Distribution by Hour'
                },
                legend: {
                    display: true
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Event Listeners
document.getElementById('showChartsBtn').addEventListener('click', generateCharts);

// Close chart container button
document.getElementById('chartContainer').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        e.currentTarget.style.display = 'none';
    }
});

// Helper Functions
function closeCharts() {
    document.getElementById('chartContainer').style.display = 'none';
}

function closeReport() {
    document.getElementById('reportContainer').style.display = 'none';
    document.getElementById('reportOverlay').style.display = 'none';
}

function showExportOptions() {
    Swal.fire({
        title: 'Export Options',
        html: `
                    <button class="btn btn-primary" onclick="window.eventHandlers.handleExport('excel')">
                        <i class="bi bi-file-earmark-excel"></i> Export as Excel
                    </button>
                    <button class="btn btn-primary" onclick="window.eventHandlers.handleExport('pdf')">
                        <i class="bi bi-file-earmark-pdf"></i> Export as PDF
                    </button>
                `,
        showConfirmButton: false
    });
}

function exportReport(format) {
    const report = utils.generateReport();
    const filename = `report_${new Date().toISOString().split('T')[0]}.${format}`;

    if (format === 'excel') {
        utils.exportToExcel([report], filename);
    } else {
        utils.exportToPDF([report], filename);
    }
}

// Add global export functions
window.exportToExcel = (filename) => {
    const data = filename.startsWith('table1') ? state.table1Data : state.table2Data;
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `${filename}.xlsx`);
};

window.exportToPDF = (filename) => {
    const data = filename.startsWith('table1') ? state.table1Data : state.table2Data;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.autoTable({
        head: [Object.keys(data[0])],
        body: data.map(row => Object.values(row)),
        theme: 'grid'
    });
    doc.save(`${filename}.pdf`);
};

window.exportToHTML = (filename) => {
    const data = filename.startsWith('table1') ? state.table1Data : state.table2Data;
    const tableHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>${filename}</title>
                    <style>
                        table { border-collapse: collapse; width: 100%; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f2f2f2; }
                        tr:nth-child(even) { background-color: #f9f9f9; }
                        tr:hover { background-color: #f5f5f5; }
                    </style>
                </head>
                <body>
                    <table>
                        <thead>
                            <tr>${Object.keys(data[0]).map(key => `<th>${key}</th>`).join('')}</tr>
                        </thead>
                        <tbody>
                            ${data.map(row => `
                                <tr>${Object.values(row).map(value => `<td>${value}</td>`).join('')}</tr>
                            `).join('')}
                        </tbody>
                    </table>
                </body>
                </html>
            `;
    const blob = new Blob([tableHtml], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.html`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// Prevent drag and drop events globally
function preventDragAndDrop() {
    // Remove draggable attribute from all elements
    document.querySelectorAll('[draggable="true"]').forEach(el => {
        el.removeAttribute('draggable');
    });

    // Prevent drag and drop events
    ['dragstart', 'drop', 'dragover'].forEach(eventName => {
        document.addEventListener(eventName, e => {
            e.preventDefault();
            return false;
        });
    });
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', preventDragAndDrop);
} else {
    preventDragAndDrop();
}