const SHEET_ID = "1xydLswJHJPS6Vry7P7XcjUMdTRJK1vQ-VatN4B4chLI";
        const API_KEY = "AIzaSyBIAZIlEL2OqSP4SGvUjcjZwL9p7aPVWuA";
        const MONTHLY_SALARY = 5500;
        const WORKING_DAYS = 26;

        async function initializePeriods() {
            try {
                const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?key=${API_KEY}`);
                if (!response.ok) throw new Error('API_ERROR');

                const data = await response.json();
                const sheets = data.sheets.map(sheet => sheet.properties.title);
                const periods = organizeIntoPeriods(sheets);
                populatePeriodsDropdown(periods);
            } catch (error) {
                console.error('Error initializing periods:', error);
                document.getElementById('month').innerHTML = '<option value="">Error loading periods</option>';
            }
        }

        function organizeIntoPeriods(sheets) {
            // Sort sheets by date
            const sortedSheets = sheets.sort((a, b) => {
                const [dayA, monthA] = a.split('/').map(Number);
                const [dayB, monthB] = b.split('/').map(Number);
                if (monthA !== monthB) return monthA - monthB;
                return dayA - dayB;
            });

            const periods = new Map();

            sortedSheets.forEach(sheet => {
                const [day, month] = sheet.split('/').map(Number);

                // Determine period
                let periodMonth, periodYear;
                if (day >= 26) {
                    periodMonth = month === 12 ? 1 : month + 1;
                } else {
                    periodMonth = month;
                }

                const periodKey = periodMonth;
                if (!periods.has(periodKey)) {
                    periods.set(periodKey, {
                        month: periodMonth,
                        sheets: []
                    });
                }
                periods.get(periodKey).sheets.push(sheet);
            });

            // Validate periods - only keep complete periods (26-25)
            const validPeriods = Array.from(periods.values()).filter(period => {
                const sheets = period.sheets;
                const days = sheets.map(sheet => parseInt(sheet.split('/')[0]));

                // Check if period has days from 26th of previous month
                const hasStartDays = days.some(day => day >= 26);
                // Check if period has days until 25th of current month
                const hasEndDays = days.some(day => day <= 25);

                return hasStartDays && hasEndDays;
            });

            return validPeriods;
        }

        function populatePeriodsDropdown(periods) {
            const monthSelect = document.getElementById('month');
            const monthNames = [
                "January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"
            ];

            monthSelect.innerHTML = '<option value="">Select Period</option>' +
                periods.map(period => {
                    const monthName = monthNames[period.month - 1];
                    const prevMonthName = monthNames[period.month === 1 ? 11 : period.month - 2];
                    // Sort sheets to find start and end dates
                    const sortedSheets = period.sheets.sort((a, b) => {
                        const [dayA, monthA] = a.split('/').map(Number);
                        const [dayB, monthB] = b.split('/').map(Number);
                        if (monthA !== monthB) return monthA - monthB;
                        return dayA - dayB;
                    });

                    // Escape quotes and ensure proper JSON string formatting
                    const sheetsValue = JSON.stringify(period.sheets).replace(/"/g, '&quot;');

                    return `<option value='${sheetsValue}'>
                        Period: 26 ${prevMonthName} - 25 ${monthName} (${period.sheets.length} days)
                    </option>`;
                }).join('');
        }

        async function fetchAttendance() {
            const employeeName = document.getElementById("employeeName").value.trim();
            const monthSelect = document.getElementById("month");
            const outputDiv = document.getElementById("output");

            outputDiv.innerHTML = createLoading();
            if (!validateInput(employeeName)) return;

            try {
                const selectedValue = monthSelect.value;
                if (!selectedValue) {
                    return showError("Please select a period", outputDiv);
                }

                const sheets = JSON.parse(selectedValue);
                if (!sheets.length) return showError("No data found for selected period", outputDiv);

                const { presentDays, allDays } = await processSheets(sheets, employeeName);
                if (!presentDays.length) return showError("No records found for this employee", outputDiv);

                displayReport(presentDays, allDays, "", outputDiv);
            } catch (error) {
                handleError(error, outputDiv);
            }
        }

        // Helper functions
        function createLoading() {
            return `<div class="d-flex align-items-center text-primary">
                <div class="spinner-border me-2"></div>
                Analyzing attendance data...
            </div>`;
        }

        function validateInput(name) {
            if (!name) {
                showError("Please enter employee name", document.getElementById("output"));
                return false;
            }
            return true;
        }

        async function processSheets(sheetNames, employeeName) {
            let presentDays = [];
            const allDays = [];

            for (const sheetName of sheetNames) {
                try {
                    const response = await fetch(
                        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}?key=${API_KEY}`
                    );
                    if (!response.ok) continue;

                    const data = await response.json();
                    if (!data.values) continue;

                    const [day, month] = sheetName.split('/');
                    allDays.push({ 
                        day: formatDate(day, month),
                        status: data.values.find(row => row[3] === employeeName)?.[14] || '0' // Store status for absent days
                    });

                    const employeeRow = data.values.find(row => row[3] === employeeName);
                    if (!employeeRow) continue;

                    presentDays.push(processAttendanceRow({ day, month }, employeeRow));
                } catch (error) {
                    console.error('Sheet processing error:', error);
                }
            }
            return { presentDays, allDays };
        }

   function processAttendanceRow(dateInfo, employeeRow) {
    // Check columns M, O, and P for time
    const timeM = employeeRow[12]?.trim() || ""; // Column M
    const timeO = employeeRow[14]?.trim() || ""; // Column O
    const timeP = employeeRow[15]?.trim() || ""; // Column P

    // Check columns Q, O, and R for deductions
    const deductionQ = employeeRow[16]?.trim() || ""; // Column Q
    const deductionO = employeeRow[14]?.trim() || ""; // Column O
    const deductionR = employeeRow[17]?.trim() || ""; // Column R

    // Check if there's a time in any of the columns
    const hasTimeM = timeM.match(/\d{1,2}:\d{2}/) && timeM !== "0"; // Ensure timeM is not "0"
    const hasTimeO = timeO.match(/\d{1,2}:\d{2}/) && timeO !== "0"; // Ensure timeO is not "0"
    const hasTimeP = timeP.match(/\d{1,2}:\d{2}/) && timeP !== "0"; // Ensure timeP is not "0"

    // Use the time that exists (if any)
    const time = hasTimeM ? timeM : hasTimeO ? timeO : hasTimeP ? timeP : "";

    let attendanceStatus;
    // If there's time in any column, mark as present
    if (hasTimeM || hasTimeO || hasTimeP) {
        attendanceStatus = 'present';
    }
    // If no time in any column, mark as absent
    else {
        attendanceStatus = 'absent';
    }

    // Check for deductions in columns Q, O, and R
    const deductions = [];
    const ignoreList = ["(P) GT","(T) GT", "T1", "T2", "T3", "E", "0", "P", "T"]; // Values to ignore
    if (deductionQ && !ignoreList.includes(deductionQ) && !deductionQ.match(/\d{1,2}:\d{2}/)) {
        deductions.push({ column: "Q", reason: deductionQ });
    }
    if (deductionO && !ignoreList.includes(deductionO) && !deductionO.match(/\d{1,2}:\d{2}/)) {
        deductions.push({ column: "O", reason: deductionO });
    }
    if (deductionR && !ignoreList.includes(deductionR) && !deductionR.match(/\d{1,2}:\d{2}/)) {
        deductions.push({ column: "R", reason: deductionR });
    }

    return {
        day: formatDate(dateInfo.day, dateInfo.month),
        status: timeM || timeO || timeP || "", // Store the actual value for reference
        time: time,
        deductions: deductions, // Store deductions with reasons
        isLate: checkLateTime(time),
        attendanceStatus: attendanceStatus
    };
}
        function checkLateTime(timeStr) {
            if (!timeStr) return false;

            // Extract time using regex to handle different formats
            const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
            if (!timeMatch) return false;

            let [_, hours, minutes, period] = timeMatch;
            hours = Number(hours);
            minutes = Number(minutes);

            if (period) {
                period = period.toUpperCase();
                if (period === 'PM' && hours !== 12) hours += 12;
                if (period === 'AM' && hours === 12) hours = 0;
            }

            return hours > 8 || (hours === 8 && minutes > 5);
        }

        function displayReport(presentDays, allDays, month, container) {
            const dailySalary = MONTHLY_SALARY / WORKING_DAYS;
            const deductions = calculateDeductions(presentDays);

            // Filter days by attendance status
            const actualPresentDays = presentDays.filter(day => 
                day.attendanceStatus === 'present'
            );
            const absentDays = allDays.filter(day => {
                const isPresentDay = presentDays.some(p => p.day === day.day);
                if (!isPresentDay) return true;
                const presentDay = presentDays.find(p => p.day === day.day);
                return presentDay.attendanceStatus === 'absent';
            });

            // Calculate unaccounted days
            const accountedDays = new Set([
                ...actualPresentDays.map(d => d.day),
                ...absentDays.map(d => d.day)
            ]);
            const unaccountedDays = allDays.filter(day => !accountedDays.has(day.day));

            container.innerHTML = `
                <div class="row g-4">
                    <!-- Period Summary -->
                    <div class="col-12">
                        <div class="alert alert-info">
                            <h5>Period Summary</h5>
                            <p>Total Days in Period: ${allDays.length}</p>
                            <p>Present Days: ${actualPresentDays.length}</p>
                            <p>Absent Days: ${absentDays.length}</p>
                            ${unaccountedDays.length > 0 ? 
                                `<p class="text-warning">Unaccounted Days: ${unaccountedDays.length}</p>` : ''}
                        </div>
                    </div>
                    <!-- Summary Cards -->
                    <div class="col-md-4">
                        <div class="result-card border-success">
                            <h5>Present Days</h5>
                            <div class="display-4">${actualPresentDays.length}</div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="result-card border-danger">
                            <h5>Absent Days</h5>
                            <div class="display-4">${absentDays.length}</div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="result-card border-primary">
                            <h5>Deductions</h5>
                            <div class="display-4">${deductions.total}</div>
                        </div>
                    </div>
                    <!-- Salary Calculation -->
                    <div class="col-12">
                        <div class="salary-box">
                            <div class="row">
                                <div class="col-md-4">
                                    <h5>Daily Salary</h5>
                                    <p>$${dailySalary.toFixed(2)}</p>
                                </div>
                                <div class="col-md-4">
                                    <h5>Net Working Days</h5>
                                    <p>${actualPresentDays.length - deductions.total}</p>
                                </div>
                                <div class="col-md-4">
                                    <h5>Expected Salary</h5>
                                    <p class="text-success">$${(dailySalary * (actualPresentDays.length - deductions.total)).toFixed(2)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- Detailed Sections -->
                    <div class="col-12">
                        <div class="accordion" id="reportAccordion">
                            ${createAccordionSection('present', 'Present Days', actualPresentDays)}
                            ${createAccordionSection('absent', 'Absent Days', absentDays)}
                            ${createAccordionSection('deductions', 'Deductions', deductions.list)}
                            ${unaccountedDays.length > 0 ? 
                                createAccordionSection('unaccounted', 'Unaccounted Days', unaccountedDays.map(day => ({
                                    day: day.day,
                                    status: day.status,
                                    details: 'Unable to determine status'
                                }))) : ''}
                        </div>
                    </div>
                </div>
            `;
        }

       function createAccordionSection(type, title, items) {
    return `
        <div class="accordion-item">
            <h2 class="accordion-header">
                <button class="accordion-button ${type !== 'present' ? 'collapsed' : ''}" 
                        type="button" 
                        data-bs-toggle="collapse" 
                        data-bs-target="#${type}Section">
                    ${title} (${items.length})
                </button>
            </h2>
            <div id="${type}Section" 
                 class="accordion-collapse collapse ${type === 'present' ? 'show' : ''}" 
                 data-bs-parent="#reportAccordion">
                <div class="accordion-body">
                    ${items.length ? items.map(item => {
                        if (type === 'deductions') {
                            return `
                                <div class="deduction-item">
                                    <strong>Day ${item.day}:</strong> ${item.details}
                                    <span class="badge bg-danger">${item.value} day</span>
                                </div>
                            `;
                        } else if (type === 'unaccounted') {
                            return `
                                <div class="d-flex justify-content-between py-2 border-bottom">
                                    <span>Day ${item.day}</span>
                                    <span class="text-warning">
                                        Status: ${item.status || 'Unknown'}
                                        <br>
                                        <small>${item.details}</small>
                                    </span>
                                </div>
                            `;
                        } else {
                            return `
                                <div class="d-flex justify-content-between py-2 border-bottom">
                                    <span>Day ${item.day}</span>
                                    <span class="${type === 'absent' ? 'text-danger' : ''}">
                                        ${type === 'absent' ? 'Absent' : ''}
                                        ${item.time ? `(${item.time})` : ''}
                                        ${item.isLate ? '<br><small class="text-danger">Late</small>' : ''}
                                    </span>
                                </div>
                            `;
                        }
                    }).join('') : 'No records found'}
                </div>
            </div>
        </div>
    `;
}

       function calculateDeductions(presentDays) {
    let total = 0;
    const list = [];

    presentDays.forEach(day => {
        // Check for late arrival
        if (day.isLate) {
            total += 0.5;
            list.push({
                day: day.day,
                details: `Late arrival (${day.time})`,
                value: 0.5
            });
        }

        // Check for deductions in columns Q, O, and R
        if (day.deductions && day.deductions.length > 0) {
            day.deductions.forEach(deduction => {
                total += 0.5; // Half day deduction for each deduction
                list.push({
                    day: day.day,
                    details: `Deduction (${deduction.column}): ${deduction.reason}`,
                    value: 0.5
                });
            });
        }
    });

    return { total, list };
}
        function calculateAbsences(allDays, presentDays) {
            return allDays
                .filter(dayInfo => {
                    const formattedDate = dayInfo.day;
                    return !presentDays.some(p => p === formattedDate);
                })
                .map(dayInfo => ({
                    day: dayInfo.day,
                    status: dayInfo.status
                }));
        }


        function showError(message, container) {
            container.innerHTML = `<div class="alert alert-danger">${message}</div>`;
        }

        function handleError(error, container) {
            console.error(error);
            const message = error.message === 'API_ERROR' 
                ? 'API Error - Check credentials and sheet sharing settings'
                : 'Connection Error - Please check internet connection';
            showError(message, container);
        }

        function formatDate(day, month) {
            console.log('formatDate input - day:', day, 'month:', month);

            if (!month) {
                console.error('Month is undefined or empty for day:', day);
                return `${day} (Invalid Month)`;
            }

            const monthNames = [
                "January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"
            ];

            const monthIndex = parseInt(month) - 1;
            console.log('Month index:', monthIndex);

            if (monthIndex < 0 || monthIndex >= 12) {
                console.error('Invalid month number:', month);
                return `${day} (Invalid Month)`;
            }

            const monthName = monthNames[monthIndex];
            return `${day} ${monthName}`;
        }

        document.addEventListener('DOMContentLoaded', initializePeriods);
