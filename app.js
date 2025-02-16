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
                
                // Add this: Initialize names autocomplete after loading periods
                await initializeNamesAutocomplete(sheets);
            } catch (error) {
                console.error('Error initializing periods:', error);
                document.getElementById('month').innerHTML = '<option value="">Error loading periods</option>';
            }
        }

        function organizeIntoPeriods(sheets) {
            // Sort sheets by date with year consideration
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
                let periodMonth;
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

            // Convert to array and sort by month
            const validPeriods = Array.from(periods.values())
                .filter(period => {
                    const sheets = period.sheets;
                    const days = sheets.map(sheet => parseInt(sheet.split('/')[0]));
                    const hasStartDays = days.some(day => day >= 26);
                    const hasEndDays = days.some(day => day <= 25);
                    return hasStartDays && hasEndDays;
                })
                .sort((a, b) => a.month - b.month);

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
                    const prevMonth = period.month === 1 ? 12 : period.month - 1;
                    const prevMonthName = monthNames[prevMonth - 1];
                    
                    // Sort sheets to display date range
                    const sortedSheets = period.sheets.sort((a, b) => {
                        const [dayA, monthA] = a.split('/').map(Number);
                        const [dayB, monthB] = b.split('/').map(Number);
                        if (monthA !== monthB) return monthA - monthB;
                        return dayA - dayB;
                    });

                    const sheetsValue = JSON.stringify(period.sheets).replace(/"/g, '&quot;');

                    return `<option value='${sheetsValue}'>
                        ${monthName} Period (26 ${prevMonthName} - 25 ${monthName}) - ${period.sheets.length} days
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
                    if (!data.values || data.values.length < 2) continue;

                    const headerRow = data.values[0];
                    const columns = {
                        checkIn: headerRow.findIndex(col => col?.toLowerCase().includes('check in')),
                        checkOut: headerRow.findIndex(col => col?.toLowerCase().includes('check out')),
                        violation: headerRow.findIndex(col => col?.toLowerCase().includes('violation')),
                        name: headerRow.findIndex(col => col?.toLowerCase().includes('name'))
                    };

                    if (columns.name === -1) continue;

                    const [day, month] = sheetName.split('/');
                    const employeeRow = data.values.find(row => row[columns.name] === employeeName);

                    // Always add to allDays, even if employee is not found
                    allDays.push({ 
                        day: formatDate(day, month),
                        status: employeeRow ? 'present' : 'absent',
                        sheetName: sheetName // Add sheet name for reference
                    });

                    if (employeeRow) {
                        presentDays.push(processAttendanceRow({ day, month }, employeeRow, columns));
                    }
                } catch (error) {
                    console.error('Sheet processing error:', error);
                }
            }
            return { presentDays, allDays };
        }

        function processAttendanceRow(dateInfo, employeeRow, columns) {
            const checkInTime = columns.checkIn !== -1 ? employeeRow[columns.checkIn]?.trim() : "";
            const checkOutTime = columns.checkOut !== -1 ? employeeRow[columns.checkOut]?.trim() : "";
            const violation = columns.violation !== -1 ? employeeRow[columns.violation]?.trim() : "";

            // Calculate deductions
            const deductions = [];
            
            // Check late arrival - only add deduction if there's no "Late Arrival" violation
            if (checkInTime && checkLateTime(checkInTime) && 
                (!violation || !violation.toLowerCase().includes('late arrival'))) {
                deductions.push({
                    column: "Check In",
                    reason: `Late Arrival (${checkInTime})`,
                    value: 0.5
                });
            }

            // Check early departure
            if (checkOutTime) {
                const earlyDeparture = checkEarlyDeparture(checkOutTime);
                if (earlyDeparture) {
                    deductions.push({
                        column: "Check Out",
                        reason: `Early Departure (${checkOutTime})`,
                        value: earlyDeparture
                    });
                }
            }

            // Check violations - only add if it's not a late arrival violation
            if (violation && !violation.toLowerCase().includes('late arrival')) {
                deductions.push({
                    column: "Violation",
                    reason: violation,
                    value: 0.5
                });
            }

            return {
                day: formatDate(dateInfo.day, dateInfo.month),
                checkIn: checkInTime,
                checkOut: checkOutTime,
                deductions: deductions,
                isLate: checkLateTime(checkInTime),
                attendanceStatus: checkInTime ? 'present' : 'absent'
            };
        }

        function checkEarlyDeparture(timeStr) {
            if (!timeStr) return 0;

            const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
            if (!timeMatch) return 0;

            let [_, hours, minutes, period] = timeMatch;
            hours = Number(hours);
            minutes = Number(minutes);

            // If time is after 2:30, no deduction
            if (hours === 2 && minutes >= 30 || hours > 2) return 0;

            // If time is between 12:00 and 2:30, 0.5 day deduction
            if (hours === 2 || hours === 1 || hours === 12) return 0.5;

            // Before 12:00 = 1 day deduction
            return 1;
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

            // Get employee name from input
            const employeeName = document.getElementById("employeeName").value.trim();

            // Prepare statistics items
            const statisticsItems = [
                { label: 'Total Sheets in Period', value: allDays.length },
                { label: 'Sheets with Employee Record', value: presentDays.length },
                { label: 'Sheets without Employee Record', value: allDays.length - presentDays.length }
            ];

            container.innerHTML = `
                <div class="alert alert-success mb-4">
                    <h4 class="mb-0">Hey ${employeeName}! 👋</h4>
                </div>
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
                            ${createAccordionSection('statistics', 'Sheet Statistics', statisticsItems)}
                        </div>
                    </div>
                </div>
            `;
        }

        function createAccordionSection(type, title, items) {
            return `
                <div class="accordion-item">
                    <h2 class="accordion-header">
                        <button class="accordion-button collapsed" 
                                type="button" 
                                data-bs-toggle="collapse" 
                                data-bs-target="#${type}Section">
                            ${title} (${items.length})
                        </button>
                    </h2>
                    <div id="${type}Section" 
                         class="accordion-collapse collapse" 
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
                                } else if (type === 'statistics') {
                                    return `
                                        <div class="d-flex justify-content-between py-2 border-bottom">
                                            <span>${item.label}</span>
                                            <span>${item.value}</span>
                                        </div>
                                    `;
                                } else {
                                    return `
                                        <div class="d-flex justify-content-between py-2 border-bottom">
                                            <span>Day ${item.day}</span>
                                            <span class="${type === 'absent' ? 'text-danger' : ''}">
                                                ${type === 'absent' ? 'Absent' : ''}
                                                ${item.checkIn ? `(${item.checkIn})` : ''}
                                                ${item.checkOut ? `(${item.checkOut})` : ''}
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
                // Remove the general late arrival check and only use deductions from columns
                if (day.deductions && day.deductions.length > 0) {
                    day.deductions.forEach(deduction => {
                        total += deduction.value;
                        list.push({
                            day: day.day,
                            details: `Deduction (${deduction.column}): ${deduction.reason}`,
                            value: deduction.value
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

        async function initializeNamesAutocomplete(sheetNames) {
            try {
                const uniqueNames = new Set();
                
                // Get first sheet to extract names (for efficiency)
                const lastSheet = sheetNames[sheetNames.length - 1];
                const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(lastSheet)}?key=${API_KEY}`
);
                
                if (!response.ok) throw new Error('API_ERROR');
                
                const data = await response.json();
                if (!data.values || data.values.length < 2) return;
                
                // Find name column index
                const headerRow = data.values[0];
                const nameColumnIndex = headerRow.findIndex(col => col?.toLowerCase().includes('name'));
                
                if (nameColumnIndex === -1) return;
                
                // Extract all names
                data.values.slice(1).forEach(row => {
                    if (row[nameColumnIndex]) {
                        uniqueNames.add(row[nameColumnIndex].trim());
                    }
                });
                
                // Create or update datalist
                let datalist = document.getElementById('employeeNamesList');
                if (!datalist) {
                    datalist = document.createElement('datalist');
                    datalist.id = 'employeeNamesList';
                    document.body.appendChild(datalist);
                }
                
                datalist.innerHTML = Array.from(uniqueNames)
                    .sort()
                    .map(name => `<option value="${name}">`)
                    .join('');
                    
                // Add datalist to input
                const employeeNameInput = document.getElementById('employeeName');
                employeeNameInput.setAttribute('list', 'employeeNamesList');
                
            } catch (error) {
                console.error('Error initializing names autocomplete:', error);
            }
        }

        document.addEventListener('DOMContentLoaded', initializePeriods);
