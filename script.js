document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const apiKeyInput = document.getElementById('apiKeyInput');
    
    const refreshBtn = document.getElementById('refreshBtn');
    const lastUpdated = document.getElementById('lastUpdated');
    const delayList = document.getElementById('delayList');
    const selectedList = document.getElementById('selectedList');
    const selectedLinesSection = document.getElementById('selectedLinesSection');
    const otherDelaysSection = document.getElementById('otherDelaysSection');
    const lineSelectionContainer = document.getElementById('lineSelectionContainer');
    
    const loadingState = document.getElementById('loading');
    const errorState = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    const noDelayMessage = document.getElementById('noDelayMessage');
    const delayListContainer = document.querySelector('.delay-list-container');

    // Constants
    const API_KEY_STORAGE_KEY = 'odpt_api_key';
    const SELECTED_LINES_KEY = 'odpt_selected_lines';
    const API_ENDPOINT = 'https://api.odpt.org/api/v4/odpt:TrainInformation';

    let globalTrainData = [];
    let autoRefreshInterval = null;

    // Normal operation texts to filter out
    const NORMAL_TEXTS = [
        '平常運転',
        '平常通り運転しています',
        '平常通り運行しています',
        '平常通り',
        '現在、平常通り運転しています。',
        '平常'
    ];

    // Minor delay/info texts to show as orange badge
    const MINOR_TEXTS = [
        '15分以上の遅延はありません',
        '１５分以上の遅延はありません',
        '15分以上の遅れはありません',
        '１５分以上の遅れはありません',
        'ほぼ平常',
        '遅れはありません'
    ];

    // Predefined major lines for selection
    const PREDEFINED_LINES = [
        '山手線', '京浜東北線', '中央線快速電車', '中央･総武各駅停車', '東海道線', '宇都宮線', '高崎線', '埼京線', '湘南新宿ライン', '常磐線', '総武快速線', '京葉線', '武蔵野線', '南武線', '横浜線',
        '銀座線', '丸ノ内線', '日比谷線', '東西線', '千代田線', '有楽町線', '半蔵門線', '南北線', '副都心線',
        '浅草線', '三田線', '新宿線', '大江戸線',
        '小田原線', '江ノ島線', '多摩線',
        '京王線', '井の頭線',
        '東横線', '目黒線', '田園都市線', '大井町線', '池上線', '東急多摩川線',
        '西武池袋線', '西武新宿線',
        '東武スカイツリーライン', '東武東上線',
        '京急本線', '京成本線', '相鉄本線'
    ];

    // Initialization
    function init() {
        const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
        if (!apiKey) {
            openModal();
        } else {
            apiKeyInput.value = apiKey;
            fetchTrainInfo(apiKey);
            startAutoRefresh(apiKey);
        }
    }

    function startAutoRefresh(apiKey) {
        if (autoRefreshInterval) clearInterval(autoRefreshInterval);
        autoRefreshInterval = setInterval(() => {
            fetchTrainInfo(apiKey, true);
        }, 60 * 1000); // 1 minute
    }

    // Modal Handling
    function openModal() {
        settingsModal.classList.remove('hidden');
    }

    function closeModal() {
        settingsModal.classList.add('hidden');
    }

    settingsBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);

    // Save Settings
    saveSettingsBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        
        // Get selected lines
        const checkboxes = lineSelectionContainer.querySelectorAll('input[type="checkbox"]');
        const selectedLines = [];
        checkboxes.forEach(cb => {
            if (cb.checked) {
                selectedLines.push(cb.value);
            }
        });
        localStorage.setItem(SELECTED_LINES_KEY, JSON.stringify(selectedLines));

        if (key) {
            localStorage.setItem(API_KEY_STORAGE_KEY, key);
            closeModal();
            fetchTrainInfo(key);
            startAutoRefresh(key);
        } else {
            alert('アクセストークンを入力してください。');
        }
    });

    // Refresh Data
    refreshBtn.addEventListener('click', () => {
        const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
        if (apiKey) {
            fetchTrainInfo(apiKey);
        } else {
            openModal();
        }
    });

    // Format Railway Name (fallback if dc:title is not available)
    function formatRailwayName(id) {
        if (!id) return '不明な路線';
        // e.g. "odpt.Railway:JR-East.Yamanote" -> "JR-East Yamanote"
        return id.replace('odpt.Railway:', '').replace(/\./g, ' ');
    }

    // Populate Line Selection in Modal
    function populateLineSelection(data) {
        let selectedLines = [];
        try {
            selectedLines = JSON.parse(localStorage.getItem(SELECTED_LINES_KEY)) || [];
        } catch (e) {}

        const allLines = new Set(PREDEFINED_LINES);
        
        if (data && data.length > 0) {
            data.forEach(info => {
                let railwayName = '不明な路線';
                if (info['dc:title']) {
                    railwayName = typeof info['dc:title'] === 'object' && info['dc:title'].ja ? info['dc:title'].ja : info['dc:title'];
                } else if (info['odpt:railway']) {
                    railwayName = formatRailwayName(info['odpt:railway']);
                }
                allLines.add(railwayName);
            });
        }

        lineSelectionContainer.innerHTML = '';
        Array.from(allLines).forEach(railwayName => {
            const isChecked = selectedLines.includes(railwayName) ? 'checked' : '';
            const label = document.createElement('label');
            label.className = 'line-option';
            label.innerHTML = `<input type="checkbox" value="${railwayName}" ${isChecked}> <span>${railwayName}</span>`;
            lineSelectionContainer.appendChild(label);
        });
    }

    // Fetch Train Information
    async function fetchTrainInfo(apiKey, isAutoRefresh = false) {
        if (!isAutoRefresh) showLoading();
        
        try {
            const response = await fetch(`${API_ENDPOINT}?acl:consumerKey=${apiKey}`, { cache: 'no-store' });
            
            if (!response.ok) {
                throw new Error(`APIリクエストに失敗しました (${response.status})。アクセストークンが正しいか確認してください。`);
            }

            const data = await response.json();
            globalTrainData = data;
            populateLineSelection(data);
            processTrainInfo(data);
            
            // Update timestamp
            const now = new Date();
            lastUpdated.textContent = `更新日時: ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            
        } catch (error) {
            if (!isAutoRefresh) {
                showError(error.message);
            } else {
                console.error('Auto-refresh failed:', error);
                lastUpdated.textContent = `更新失敗: ${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`;
            }
        }
    }

    // Helper to generate list item HTML
    function createDelayItemHTML(railwayName, descText, status) {
        let badgeClass = '';
        let badgeText = '遅延';
        let itemClass = 'delay-item';

        if (status === 'normal') {
            badgeClass = 'normal';
            badgeText = '平常運転';
            itemClass += ' normal';
        } else if (status === 'minor') {
            badgeClass = 'minor';
            badgeText = 'お知らせ';
            itemClass += ' minor';
        } else if (status === 'stop') {
            badgeClass = 'stop';
            badgeText = '運転見合わせ';
        }

        const li = document.createElement('li');
        li.className = itemClass;
        li.innerHTML = `
            <div class="delay-item-header">
                <span class="railway-name">${railwayName}</span>
                <span class="status-badge ${badgeClass}">${badgeText}</span>
            </div>
            <p class="delay-text">${descText}</p>
        `;
        return li;
    }

    // Process and display data
    function processTrainInfo(data) {
        delayList.innerHTML = ''; // Clear list
        selectedList.innerHTML = '';
        
        let selectedLines = [];
        try {
            selectedLines = JSON.parse(localStorage.getItem(SELECTED_LINES_KEY)) || [];
        } catch (e) {}

        let hasSelectedLines = false;
        let hasDelayedLines = false;

        // Create a map for fast lookup of fetched data
        const dataMap = new Map();
        if (data && data.length > 0) {
            data.forEach(info => {
                let railwayName = '不明な路線';
                if (info['dc:title']) {
                    railwayName = typeof info['dc:title'] === 'object' && info['dc:title'].ja 
                                    ? info['dc:title'].ja 
                                    : info['dc:title'];
                } else if (info['odpt:railway']) {
                    railwayName = formatRailwayName(info['odpt:railway']);
                }
                dataMap.set(railwayName, info);
            });
        }

        // 1. Process selected lines (whether in data or not)
        selectedLines.forEach(railwayName => {
            const info = dataMap.get(railwayName);
            let descText = '情報なし（平常運転の可能性があります）';
            let status = 'normal';

            if (info) {
                const text = info['odpt:trainInformationText'];
                if (text) {
                    if (typeof text === 'object' && text.ja) {
                        descText = text.ja;
                    } else if (typeof text === 'string') {
                        descText = text;
                    }
                } else {
                    descText = '情報がありません';
                }

                // Check status
                if (!text) {
                    status = 'normal';
                } else {
                    const isNormal = NORMAL_TEXTS.some(normalText => descText.includes(normalText));
                    const isMinor = MINOR_TEXTS.some(minorText => descText.includes(minorText));
                    const isStop = descText.includes('見合') || descText.includes('運休');
                    const isDelay = descText.includes('遅延') || descText.includes('遅れ') || descText.includes('乱れ');

                    if (isStop) {
                        status = 'stop';
                    } else if (isNormal) {
                        status = 'normal';
                    } else if (isMinor) {
                        status = 'minor';
                    } else if (isDelay) {
                        status = 'delay';
                    } else {
                        status = 'normal';
                    }
                }
            }

            const li = createDelayItemHTML(railwayName, descText, status);
            selectedList.appendChild(li);
            hasSelectedLines = true;
            
            // Remove from map so we don't process it again in the next step
            dataMap.delete(railwayName);
        });

        // 2. Process remaining delayed lines
        dataMap.forEach((info, railwayName) => {
            const text = info['odpt:trainInformationText'];
            let descText = '情報がありません';
            if (text) {
                if (typeof text === 'object' && text.ja) {
                    descText = text.ja;
                } else if (typeof text === 'string') {
                    descText = text;
                }
            }

            let status = 'delay';
            if (!text) {
                status = 'normal';
            } else {
                const isNormal = NORMAL_TEXTS.some(normalText => descText.includes(normalText));
                const isMinor = MINOR_TEXTS.some(minorText => descText.includes(minorText));
                const isStop = descText.includes('見合') || descText.includes('運休');
                const isDelay = descText.includes('遅延') || descText.includes('遅れ') || descText.includes('乱れ');

                if (isStop) {
                    status = 'stop';
                } else if (isNormal) {
                    status = 'normal';
                } else if (isMinor) {
                    status = 'minor';
                } else if (isDelay) {
                    status = 'delay';
                } else {
                    status = 'normal';
                }
            }

            if (status !== 'normal') {
                const li = createDelayItemHTML(railwayName, descText, status);
                delayList.appendChild(li);
                hasDelayedLines = true;
            }
        });

        if (!hasSelectedLines && !hasDelayedLines) {
            showNoDelay();
        } else {
            selectedLinesSection.classList.toggle('hidden', !hasSelectedLines);
            otherDelaysSection.classList.toggle('hidden', !hasDelayedLines);
            showData();
        }
    }

    // State Management Helpers
    function showLoading() {
        loadingState.classList.remove('hidden');
        errorState.classList.add('hidden');
        noDelayMessage.classList.add('hidden');
        delayListContainer.classList.add('hidden');
        
        // Add rotation to refresh button
        const refreshIcon = document.querySelector('.refresh-icon');
        if (refreshIcon) refreshIcon.style.animation = 'spin 1s linear infinite';
    }

    function hideLoading() {
        loadingState.classList.add('hidden');
        
        // Stop rotation
        const refreshIcon = document.querySelector('.refresh-icon');
        if (refreshIcon) refreshIcon.style.animation = 'none';
    }

    function showError(message) {
        hideLoading();
        errorText.textContent = message;
        errorState.classList.remove('hidden');
        noDelayMessage.classList.add('hidden');
        delayListContainer.classList.add('hidden');
    }

    function showNoDelay() {
        hideLoading();
        errorState.classList.add('hidden');
        noDelayMessage.classList.remove('hidden');
        delayListContainer.classList.add('hidden');
    }

    function showData() {
        hideLoading();
        errorState.classList.add('hidden');
        noDelayMessage.classList.add('hidden');
        delayListContainer.classList.remove('hidden');
    }

    // Close modal on click outside
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            // Only close if there's an API key
            if (localStorage.getItem(API_KEY_STORAGE_KEY)) {
                closeModal();
            } else {
                alert('アプリを利用するにはアクセストークンを設定してください。');
            }
        }
    });

    // Start App
    init();
});
