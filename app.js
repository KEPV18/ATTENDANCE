function calculateAttendance() {
    const mockData = {
        presentDays: 11,
        absentDays: 0,
        deductions: 1.5,
        dailySalary: 211.54,
        netWorkingDays: 9.5,
        expectedSalary: 2009.62,
        deductionDetails: [
            { date: '15/02', type: 'انصراف مبكر', amount: 0.5 },
            { date: '20/02', type: 'غياب كامل', amount: 1 }
        ],
        presentDetails: ['26/01', '27/01', '28/01', '29/01', '30/01', '1/02', '2/02', '5/02', '10/02', '15/02', '20/02']
    };
    updateDashboard(mockData);
}

function updateDashboard(data) {
    const dashboard = document.getElementById('dashboard');
    dashboard.innerHTML = `
        <div class="card" data-type="present" onclick="showDetails('أيام الحضور', this.getAttribute('data-details'))" data-details='${JSON.stringify(data.presentDetails)}'>
            <h3>أيام الحضور</h3>
            <h2>${data.presentDays}</h2>
        </div>
        <div class="card" data-type="deductions" onclick="showDetails('الخصومات', this.getAttribute('data-details'))" data-details='${JSON.stringify(data.deductionDetails)}'>
            <h3>الخصومات</h3>
            <h2>${data.deductions}</h2>
        </div>
        <div class="card">
            <h3>الراتب اليومي</h3>
            <h2>$${data.dailySalary.toFixed(2)}</h2>
        </div>
        <div class="card">
            <h3>الراتب المتوقع</h3>
            <h2>$${data.expectedSalary.toFixed(2)}</h2>
        </div>
    `;
}

function showDetails(type, details) {
    console.log("Type:", type);
    console.log("Details:", details);

    const modalContent = document.getElementById('modalContent');
    const parsedDetails = JSON.parse(details); // تحويل النص إلى كائن
    const items = parsedDetails.map(d => 
        `<li class="detail-item">
            <span class="date">${d.date || ''}</span>
            <span class="type">${d.type || ''}</span>
            <span class="amount">${d.amount ? `-${d.amount}` : ''}</span>
        </li>`
    ).join('');
    modalContent.innerHTML = `
        <h2 class="modal-title">تفاصيل ${type}</h2>
        <ul class="details-list">${items}</ul>
    `;
    document.getElementById('detailsModal').style.display = 'block';
}

// إغلاق المودال
document.querySelector('.close-btn').addEventListener('click', () => {
    document.getElementById('detailsModal').style.display = 'none';
});
