// --- 1. TIỆN ÍCH CHUẨN HÓA ---
const chuanHoaTen = (str) => {
    if (!str) return '';
    return str.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') 
        .replace(/[\s|\/]+/g, '_')
        .replace(/_+/g, '_')
        .trim();
};

// --- 2. TRẠNG THÁI ỨNG DỤNG ---
const appState = {
    currentData: [],
    playlist: [],
    audioPlayer: new Audio(),
    isPlaying: false,
    isRandom: false,
    currentIndex: -1,
    playTimeout: null,
    filesMap: {
        'tab-vandap': 'Hoi_Dap.html',
        'tab-tinhtoan': 'Tinh_Toan_Don_Vi.html',
        'tab-bienbao': 'Bien_Bao_An_Toan.html'
    },
    // Định nghĩa sẵn các tab con cố định cho Tab 3 và Tab 4 nếu cần
    fixedSubTabs: {
        'tab-tinhtoan': ['Tính toán', 'Đổi đơn vị'],
        'tab-bienbao': [
            'Sản xuất chế tạo', 
            'Nông nghiệp', 
            'Lâm nghiệp', 
            'Ngư nghiệp', 
            'Xây dựng', 
            'Dịch vụ', 
            'Khai thác mỏ', 
            'Đóng tàu'
        ]
    }
};

// --- 3. BÓC TÁCH DỮ LIỆU HTML ---
const fetchAndParseData = async (fileName) => {
    try {
        const res = await fetch(fileName);
        if (!res.ok) throw new Error(`Không tìm thấy file ${fileName}`);
        const htmlText = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        
        const rows = doc.querySelectorAll('tbody tr');
        const parsedData = [];
        const categoryCounts = {};

        rows.forEach(tr => {
            const cells = tr.querySelectorAll('td');
            if (cells.length < 3) return; 

            const phanLoai = cells[1]?.innerText.trim() || '';
            const textHan = cells[2]?.innerText.trim() || '';
            const trans = cells[3]?.innerText.trim() || '';
            const ansKo = cells[4]?.innerText.trim() || '';
            const ansVi = cells[5]?.innerText.trim() || '';

            if (!phanLoai || phanLoai.toLowerCase().includes('phan_loai') || !textHan || textHan.toLowerCase().includes('noi_dung_han') || textHan.toLowerCase().includes('de_bai_han')) return;

            const slug = chuanHoaTen(phanLoai);
            if (!categoryCounts[slug]) categoryCounts[slug] = 0;
            categoryCounts[slug]++;

            parsedData.push({
                phanLoai,
                textHan,
                trans,
                ansKo,
                ansVi,
                audioSrc: `audio/${slug}_${categoryCounts[slug]}.mp3`,
                imageSrc: `image/${slug}_${categoryCounts[slug]}.jpg`
            });
        });
        return parsedData;
    } catch (error) {
        console.error(error);
        alert(`Lỗi tải dữ liệu từ ${fileName}: ${error.message}`);
        return [];
    }
};

// --- 4. RENDER GIAO DIỆN TAB CON ---
const renderSubTabs = (data, targetId) => {
    appState.currentData = data;
    const subNav = document.getElementById('sub-nav');
    
    // Nếu là Tab 3 hoặc Tab 4, ưu tiên dùng danh sách tab con cố định, ngược lại tự động bóc từ dữ liệu (cho Tab 2)
    let categories = appState.fixedSubTabs[targetId] || [...new Set(data.map(item => item.phanLoai))];
    
    if (categories.length === 0) {
        subNav.innerHTML = '<span style="font-size:13px; color:#64748b;">Không có danh mục nào.</span>';
        document.getElementById('list-container').innerHTML = '<div class="empty-state">Không có dữ liệu</div>';
        document.getElementById('study-card').innerHTML = '<div class="empty-state">Trống</div>';
        return;
    }

    subNav.innerHTML = categories.map((cat, idx) => 
        `<button class="sub-tab-btn ${idx === 0 ? 'active' : ''}" data-cat="${cat}">
            <i class="fas fa-folder-open"></i> ${cat}
        </button>`
    ).join('');

    // Gắn sự kiện click cho tab con
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetBtn = e.currentTarget;
            document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
            targetBtn.classList.add('active');
            
            stopAudio();
            // Lọc dữ liệu theo tên tab con (hỗ trợ so sánh không phân biệt hoa thường/dấu để khớp linh hoạt với file dữ liệu)
            const selectedCat = targetBtn.dataset.cat;
            const filtered = appState.currentData.filter(item => 
                chuanHoaTen(item.phanLoai) === chuanHoaTen(selectedCat) || 
                item.phanLoai.toLowerCase().includes(selectedCat.toLowerCase())
            );
            renderList(filtered);
        });
    });

    // Tự động load tab con đầu tiên ngay lập tức khi chuyển tab chính
    const firstCat = categories[0];
    const initialFiltered = appState.currentData.filter(item => 
        chuanHoaTen(item.phanLoai) === chuanHoaTen(firstCat) || 
        item.phanLoai.toLowerCase().includes(firstCat.toLowerCase())
    );
    renderList(initialFiltered);
};

// Render danh sách câu hỏi dọc
const renderList = (filteredData) => {
    appState.playlist = filteredData;
    const container = document.getElementById('list-container');
    
    container.innerHTML = filteredData.map((item, idx) => `
        <div class="list-item" data-index="${idx}">
            <div class="item-id">Câu ${idx + 1}</div>
            <div class="item-preview" title="${item.textHan}">${item.textHan}</div>
        </div>
    `).join('');

    document.querySelectorAll('.list-item').forEach(item => {
        item.addEventListener('click', () => {
            const idx = parseInt(item.dataset.index);
            playAudio(idx);
        });
    });

    if(filteredData.length > 0) {
        updateStudyCard(0);
    } else {
        document.getElementById('study-card').innerHTML = '<div class="empty-state">Không có câu hỏi trong mục này.</div>';
    }
};

// Cập nhật khung học tập chi tiết
const updateStudyCard = (index) => {
    appState.currentIndex = index;
    const item = appState.playlist[index];
    if(!item) return;

    document.querySelectorAll('.list-item').forEach(c => c.classList.remove('active'));
    const targetItem = document.querySelector(`.list-item[data-index="${index}"]`);
    if(targetItem) {
        targetItem.classList.add('active');
        targetItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); 
    }

    const studyCard = document.getElementById('study-card');
    studyCard.innerHTML = `
        <img src="${item.imageSrc}" class="sc-img" id="sc-img" onerror="this.classList.remove('show')" onload="this.classList.add('show')">
        <div class="sc-ko">${item.textHan}</div>
        ${item.trans ? `<div class="sc-vi">${item.trans}</div>` : ''}
        ${item.ansKo || item.ansVi ? `
            <div class="sc-ans-container">
                ${item.ansKo ? `<div class="sc-ans-ko"><strong>Đáp án (KR):</strong> ${item.ansKo}</div>` : ''}
                ${item.ansVi ? `<div class="sc-ans-vi"><strong>Dịch (VN):</strong> ${item.ansVi}</div>` : ''}
            </div>
        ` : ''}
    `;
};

// --- 5. LOGIC AUDIO & PHÁT ---
const updatePlayControlsUI = () => {
    const btnSeq = document.getElementById('btn-play-seq');
    const btnRand = document.getElementById('btn-play-rand');
    
    btnSeq.innerHTML = '<i class="fas fa-play"></i> Phát Tuần Tự';
    btnRand.innerHTML = '<i class="fas fa-random"></i> Ngẫu Nhiên';
    btnSeq.classList.remove('playing-active');
    btnRand.classList.remove('playing-active');

    if(appState.isPlaying) {
        if(appState.isRandom) {
            btnRand.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang phát...';
            btnRand.classList.add('playing-active');
        } else {
            btnSeq.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang phát...';
            btnSeq.classList.add('playing-active');
        }
    }
};

const playAudio = (index) => {
    if (index < 0 || index >= appState.playlist.length) return stopAudio();
    if (appState.playlist.length === 0) return alert("Vui lòng chọn mục học!");
    
    clearTimeout(appState.playTimeout);
    appState.isPlaying = true;
    
    updateStudyCard(index);
    updatePlayControlsUI();

    appState.audioPlayer.src = appState.playlist[index].audioSrc;
    appState.audioPlayer.play().catch(() => {
        appState.playTimeout = setTimeout(playNext, 2000);
    });
};

const playNext = () => {
    let nextIdx = appState.isRandom 
        ? Math.floor(Math.random() * appState.playlist.length)
        : appState.currentIndex + 1;
    
    if (nextIdx < appState.playlist.length) {
        playAudio(nextIdx);
    } else {
        stopAudio();
    }
};

const stopAudio = () => {
    appState.audioPlayer.pause();
    appState.audioPlayer.currentTime = 0;
    appState.isPlaying = false;
    clearTimeout(appState.playTimeout);
    updatePlayControlsUI();
};

appState.audioPlayer.addEventListener('ended', () => {
    appState.playTimeout = setTimeout(playNext, 3000);
});

document.getElementById('btn-play-seq').addEventListener('click', () => { 
    appState.isRandom = false; 
    playAudio(appState.currentIndex > -1 ? appState.currentIndex : 0); 
});
document.getElementById('btn-play-rand').addEventListener('click', () => { 
    appState.isRandom = true; 
    playAudio(Math.floor(Math.random() * appState.playlist.length)); 
});
document.getElementById('btn-stop-audio').addEventListener('click', stopAudio);

// Toggles Bật/Tắt
const btnToggleVi = document.getElementById('toggle-vi');
btnToggleVi.addEventListener('click', () => {
    const isActive = btnToggleVi.classList.toggle('active');
    document.body.classList.toggle('hide-vi', !isActive);
});

const btnToggleAns = document.getElementById('toggle-ans');
btnToggleAns.addEventListener('click', () => {
    const isActive = btnToggleAns.classList.toggle('active');
    document.body.classList.toggle('hide-ans', !isActive);
});

// --- 6. XỬ LÝ TAB CHÍNH ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const targetBtn = e.currentTarget;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        targetBtn.classList.add('active');
        
        const targetId = targetBtn.dataset.target;
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        stopAudio();

        if (targetId === 'tab-teleprompter') {
            document.getElementById('tab-teleprompter').classList.add('active');
            document.getElementById('data-view-container').classList.remove('active');
        } else {
            document.getElementById('tab-teleprompter').classList.remove('active');
            document.getElementById('data-view-container').classList.add('active');
            
            const fileName = appState.filesMap[targetId];
            const data = await fetchAndParseData(fileName);
            renderSubTabs(data, targetId);
        }
    });
});

// --- 7. MÁY NHẮC CHỮ (TELEPROMPTER) ---
const tpInput = document.getElementById('tp-input');
const teleScreen = document.getElementById('tele-screen');
const tpContent = document.getElementById('tp-text-content');
const tpContainer = document.getElementById('tp-text-container');
const countdownDiv = document.getElementById('tp-countdown');

let tpReqAnimation;
let tpYPos = 0;

tpInput.value = localStorage.getItem('eps_teleprompter') || '';
tpInput.addEventListener('input', () => localStorage.setItem('eps_teleprompter', tpInput.value));

document.getElementById('tp-speed').addEventListener('input', (e) => document.getElementById('speed-val').innerText = e.target.value);
document.getElementById('tp-fontsize').addEventListener('input', (e) => document.getElementById('fontsize-val').innerText = e.target.value);

document.getElementById('btn-tp-start').addEventListener('click', () => {
    if (!tpInput.value.trim()) return alert("Vui lòng nhập văn bản!");
    
    const fontSize = document.getElementById('tp-fontsize').value;
    tpContent.style.fontSize = `${fontSize}px`;
    tpContent.innerText = tpInput.value;
    
    teleScreen.classList.remove('hidden');
    tpContainer.style.display = 'none';
    countdownDiv.classList.remove('hidden');
    
    let count = 3;
    countdownDiv.innerText = count;
    
    const countInterval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownDiv.innerText = count;
        } else {
            clearInterval(countInterval);
            countdownDiv.classList.add('hidden');
            startTeleprompter();
        }
    }, 1000);
});

const startTeleprompter = () => {
    tpContainer.style.display = 'block';
    tpYPos = tpContainer.clientHeight;
    const speed = document.getElementById('tp-speed').value / 50; 

    const scroll = () => {
        tpYPos -= speed;
        tpContent.style.top = `${tpYPos}px`;
        
        if (tpYPos + tpContent.clientHeight < 0) {
            stopTeleprompter();
        } else {
            tpReqAnimation = requestAnimationFrame(scroll);
        }
    };
    tpReqAnimation = requestAnimationFrame(scroll);
};

const stopTeleprompter = () => {
    cancelAnimationFrame(tpReqAnimation);
    teleScreen.classList.add('hidden');
};

document.getElementById('btn-tp-stop').addEventListener('click', stopTeleprompter);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !teleScreen.classList.contains('hidden')) stopTeleprompter();
});