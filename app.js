const SHEET_ID = "1xydLswJHJPS6Vry7P7XcjUMdTRJK1vQ-VatN4B4chLI";
const API_KEY = "AIzaSyBIAZIlEL2OqSP4SGvUjcjZwL9p7aPVWuA";
const MONTHLY_SALARY = 5500;
const WORKING_DAYS = 26;

async function fetchAttendance() {
    const employeeName = document.getElementById("employeeName").value.trim();
    const month = document.getElementById("month").value;
    const outputDiv = document.getElementById("output");
    
    outputDiv.innerHTML = createLoading();
    if (!validateInput(employeeName)) return;

    try {
        const sheets = await getMonthSheets(month);
        if (!sheets.length) {
            showError("لا توجد بيانات للشهر المحدد", outputDiv);
            return;
        }
        
        const { presentDays, allDays } = await processSheets(sheets, employeeName);
        if (!presentDays.length) {
            showError("لا توجد سجلات لهذا الموظف في الشهر المحدد", outputDiv);
            return;
        }
        
        displayReport(presentDays, allDays, month, outputDiv);
    } catch (error) {
        handleError(error, outputDiv);
    }
}

// Helper functions
function createLoading() {
    return `<div class="d-flex align-items-center text-primary">
        <div class="spinner-border me-2"></div>
        جاري تحليل بيانات الحضور...
    </div>`;
}

function validateInput(name) {
    if (!name) {
        showError("الرجاء إدخال اسم الموظف", document.getElementById("output"));
        return false;
    }
    return true;
}

async function getMonthSheets(month) {
    try {
        const monthPadded = month.padStart(2, '0');
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?key=${API_KEY}`);
        if (!response.ok) throw new Error('API_ERROR');
        
        const data = await response.json();
        return data.sheets
            .filter(sheet => {
                const titleParts = sheet.properties.title.split('/');
                return titleParts[1] === monthPadded;
            })
            .map(sheet => sheet.properties.title);
    } catch (error) {
        throw new Error('فشل في جلب بيانات الجدول: ' + error.message);
    }
}

async function processSheets(sheetNames, employeeName) {
    let presentDays = [];
    const allDays = [];
    
    for (const sheetName of sheetNames) {
        try {
            const response = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}?key=${API_KEY}`
            );
            if (!response.ok) {
                console.warn(`فشل في جلب بيانات الورقة: ${sheetName}`);
                continue;
            }
            
            const data = await response.json();
            if (!data.values) {
                console.warn(`لا توجد بيانات في الورقة: ${sheetName}`);
                continue;
            }

            allDays.push(sheetName);
            const employeeRow = data.values.find(row => row[3] === employeeName);
            if (!employeeRow) continue;

            presentDays.push(processAttendanceRow(sheetName, employeeRow));
        } catch (error) {
            console.error('خطأ في معالجة الورقة:', sheetName, error);
        }
    }
    return { presentDays, allDays };
}

function processAttendanceRow(day, row) {
    return {
        day,
        status: row[14] || "0",
        time: row[15]?.trim() || "",
        deduction: row[17]?.trim() || "",
        isLate: checkLateTime(row[15])
    };
}

function checkLateTime(timeStr) {
    if (!timeStr) return false;
    const [timePart, period] = timeStr.split(' ');
    let [hours, minutes] = timePart.split(':').map(Number);
    
    if (period?.toUpperCase() === 'PM' && hours !== 12) hours += 12;
    if (period?.toUpperCase() === 'AM' && hours === 12) hours = 0;
    
    return hours > 8 || (hours === 8 && minutes > 5);
}

function displayReport(presentDays, allDays, month, container) {
    const dailySalary = MONTHLY_SALARY / WORKING_DAYS;
    const deductions = calculateDeductions(presentDays);
    const absentDays = calculateAbsences(allDays, presentDays.map(p => p.day));
    
    container.innerHTML = `
        <div class="row g-4">
            <!-- Summary Cards -->
            <div class="col-md-4">
                <div class="result-card border-success">
                    <h5>أيام الحضور</h5>
                    <div class="display-4">${presentDays.length}</div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="result-card border-danger">
                    <h5>أيام الغياب</h5>
                    <div class="display-4">${absentDays.length}</div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="result-card border-primary">
                    <h5>الخصومات</h5>
                    <div class="display-4">${deductions.total}</div>
                </div>
            </div>

            <!-- Salary Calculation -->
            <div class="col-12">
                <div class="salary-box">
                    <div class="row">
                        <div class="col-md-4">
                            <h5>الراتب اليومي</h5>
                            <p>$${dailySalary.toFixed(2)}</p>
                        </div>
                        <div class="col-md-4">
                            <h5>أيام العمل الفعلية</h5>
                            <p>${presentDays.length - deductions.total}</p>
                        </div>
                        <div class="col-md-4">
                            <h5>الراتب المتوقع</h5>
                            <p class="text-success">$${(dailySalary * (presentDays.length - deductions.total)).toFixed(2)}</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Detailed Sections -->
            <div class="col-12">
                <div class="accordion" id="reportAccordion">
                    ${createAccordionSection('present', 'أيام الحضور', presentDays)}
                    ${createAccordionSection('absent', 'أيام الغياب', absentDays)}
                    ${createAccordionSection('deductions', 'الخصومات', deductions.list)}
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
                    ${items.map(item => type === 'deductions' ? `
                        <div class="deduction-item">
                            <strong>${formatArabicDate(item.day)}:</strong> ${item.details}
                            <span class="badge bg-danger">${item.value} يوم</span>
                        </div>
                    ` : `
                        <div class="d-flex justify-content-between py-2 border-bottom">
                            <span>${formatArabicDate(item.day || item)}</span>
                            ${item.isLate ? `<span class="text-danger">تأخر (${item.time})</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

function formatArabicDate(dateStr) {
    const [day, month] = dateStr.split('/');
    const months = [
        'يناير', 'فبراير', 'مارس', 'أبريل',
        'مايو', 'يونيو', 'يوليو', 'أغسطس',
        'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    return `${day} ${months[parseInt(month)-1]}`;
}

function calculateDeductions(presentDays) {
    let total = 0;
    const list = [];
    
    presentDays.forEach(day => {
        if (day.isLate) {
            total += 0.5;
            list.push({
                day: day.day,
                details: `تأخر في الحضور (${day.time})`,
                value: 0.5
            });
        }
        if (day.deduction) {
            total += 1;
            list.push({
                day: day.day,
                details: day.deduction,
                value: 1
            });
        }
    });
    
    return { total, list };
}

function calculateAbsences(allDays, presentDays) {
    return allDays.filter(day => !presentDays.includes(day));
}

function showError(message, container) {
    container.innerHTML = `<div class="alert alert-danger">${message}</div>`;
}

function handleError(error, container) {
    console.error(error);
    const message = error.message === 'API_ERROR' 
        ? 'خطأ في الاتصال بالخادم - الرجاء التحقق من إعدادات المفتاح والجدول'
        : `خطأ في الاتصال: ${error.message}`;
    showError(message, container);
}
