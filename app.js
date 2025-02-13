// Import necessary libraries
const XLSX = require('xlsx');

function calculateAttendance() {
    // Read the Excel file
    const workbook = XLSX.readFile('attendance.xlsx');
    const sheetNames = workbook.SheetNames;

    // Get the current date and month range
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // Months are zero-based
    const currentYear = currentDate.getFullYear();

    // Define the date range for the month
    const startDate = new Date(currentYear, currentMonth - 2, 26); // Start from 26th of the previous month
    const endDate = new Date(currentYear, currentMonth - 1, currentDate.getDate()); // End at the current date

    // Initialize data structures
    let attendanceData = {
        presentDays: 0,
        absentDays: 0,
        deductions: 0,
        dailySalary: 211.54,
        netWorkingDays: 0,
        expectedSalary: 0,
        deductionDetails: [],
        presentDetails: [],
        bonusDays: 0
    };

    // Process each sheet
    sheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const jsonSheet = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        // Extract column headers
        const headers = jsonSheet[0];
        const checkInIndex = headers.indexOf('Check In');
        const checkOutIndex = headers.indexOf('Check Out');
        const violationIndex = headers.indexOf('Violation');
        const pcIndex = headers.indexOf('PC');
        const dateIndex = headers.indexOf('Date');

        // Process rows
        for (let i = 1; i < jsonSheet.length; i++) {
            const row = jsonSheet[i];
            const date = new Date(row[dateIndex]);

            // Check if the date is within the range
            if (date >= startDate && date <= endDate) {
                const checkIn = row[checkInIndex];
                const checkOut = row[checkOutIndex];
                const violation = row[violationIndex];

                // Skip weekends unless specified as worked
                if (date.getDay() === 5 && !row.includes('Friday')) continue; // Friday is day 5

                // Calculate attendance
                if (checkIn) {
                    attendanceData.presentDays++;
                    attendanceData.presentDetails.push(date.toLocaleDateString());

                    // Check for early leave
                    if (checkOut) {
                        const checkOutTime = parseTime(checkOut);
                        if (checkOutTime < parseTime('11:00 AM')) {
                            attendanceData.deductions += 1;
                            attendanceData.deductionDetails.push({
                                date: date.toLocaleDateString(),
                                type: 'Early Leave',
                                amount: 1
                            });
                        } else if (checkOutTime < parseTime('2:30 PM')) {
                            attendanceData.deductions += 0.5;
                            attendanceData.deductionDetails.push({
                                date: date.toLocaleDateString(),
                                type: 'Early Leave',
                                amount: 0.5
                            });
                        }
                    }

                    // Check for violations
                    if (violation) {
                        attendanceData.deductionDetails.push({
                            date: date.toLocaleDateString(),
                            type: 'Violation',
                            amount: 0.5
                        });
                        attendanceData.deductions += 0.5;
                    }
                } else {
                    attendanceData.absentDays++;
                }

                // Check for bonus days (worked on Friday)
                if (date.getDay() === 5 && row.includes('Friday')) {
                    attendanceData.bonusDays++;
                }
            }
        }
    });

    // Calculate net working days and expected salary
    attendanceData.netWorkingDays = attendanceData.presentDays - attendanceData.deductions;
    attendanceData.expectedSalary = attendanceData.netWorkingDays * attendanceData.dailySalary;

    // Update the dashboard
    updateDashboard(attendanceData);
}

function parseTime(timeString) {
    const [time, modifier] = timeString.split(' ');
    let [hours, minutes] = time.split(':').map(Number);

    if (modifier === 'PM' && hours !== 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;

    return hours * 60 + minutes; // Convert to minutes for easy comparison
}

function updateDashboard(data) {
    const dashboard = document.getElementById('dashboard');
    dashboard.innerHTML = `
        <div class="card" onclick="showDetails('Present Days', ${JSON.stringify(data.presentDetails)})">
            <h3>Present Days</h3>
            <h2>${data.presentDays}</h2>
        </div>
        <div class="card" onclick="showDetails('Absent Days', ${JSON.stringify([])})">
            <h3>Absent Days</h3>
            <h2>${data.absentDays}</h2>
        </div>
        <div class="card" onclick="showDetails('Deductions', ${JSON.stringify(data.deductionDetails)})">
            <h3>Deductions</h3>
            <h2>${data.deductions}</h2>
        </div>
        <div class="card">
            <h3>Daily Salary</h3>
            <h2>$${data.dailySalary.toFixed(2)}</h2>
        </div>
        <div class="card">
            <h3>Expected Salary</h3>
            <h2>$${data.expectedSalary.toFixed(2)}</h2>
        </div>
    `;
}

function showDetails(type, details) {
    const modalContent = document.getElementById('modalContent');
    const items = details.map(d => 
        `<li class="detail-item">
            <span class="date">${d.date || ''}</span>
            <span class="type">${d.type || ''}</span>
            <span class="amount">${d.amount ? `-${d.amount}` : ''}</span>
        </li>`
    ).join('');
    modalContent.innerHTML = `
        <h2 class="modal-title">Details ${type}</h2>
        <ul class="details-list">${items}</ul>
    `;
    document.getElementById('detailsModal').style.display = 'block';
}
