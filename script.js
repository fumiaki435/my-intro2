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
    
    const loadingState = document.getElementById('loading');
    const errorState = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    const noDelayMessage = document.getElementById('noDelayMessage');
    const delayListContainer = document.querySelector('.delay-list-container');

    // Constants
    const API_KEY_STORAGE_KEY = 'odpt_api_key';
    const API_ENDPOINT = 'https://api.odpt.org/api/v4/odpt:TrainInformation';

    // Normal operation texts to filter out
    const NORMAL_TEXTS = [
        '平常運転',
        '平常通り運転しています',
        '平常通り運行しています',
        '平常通り',
        '現在、平常通り運転しています。',
        '平常'
    ];

    // Initialization
    function init() {
        const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
        if (!apiKey) {
            openModal();
        } else {
            apiKeyInput.value = apiKey;
            fetchTrainInfo(apiKey);
        }
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
        if (key) {
            localStorage.setItem(API_KEY_STORAGE_KEY, key);
            closeModal();
            fetchTrainInfo(key);
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

    // Fetch Train Information
    async function fetchTrainInfo(apiKey) {
        showLoading();
        
        try {
            const response = await fetch(`${API_ENDPOINT}?acl:consumerKey=${apiKey}`);
            
            if (!response.ok) {
                throw new Error(`APIリクエストに失敗しました (${response.status})。アクセストークンが正しいか確認してください。`);
            }

            const data = await response.json();
            processTrainInfo(data);
            
            // Update timestamp
            const now = new Date();
            lastUpdated.textContent = `更新日時: ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            
        } catch (error) {
            showError(error.message);
        }
    }

    // Process and display data
    function processTrainInfo(data) {
        delayList.innerHTML = ''; // Clear list
        
        // Filter out normal operations
        const delayedLines = data.filter(info => {
            const text = info['odpt:trainInformationText'];
            // If there's no text but there's an object, consider it an issue.
            if (!text) return true;
            
            // If Japanese text is available, check if it means normal operation
            let isNormal = false;
            if (typeof text === 'object' && text.ja) {
                isNormal = NORMAL_TEXTS.some(normalText => text.ja.includes(normalText));
            } else if (typeof text === 'string') {
                isNormal = NORMAL_TEXTS.some(normalText => text.includes(normalText));
            }
            
            return !isNormal;
        });

        if (delayedLines.length === 0) {
            showNoDelay();
        } else {
            // Render items
            delayedLines.forEach(info => {
                const li = document.createElement('li');
                li.className = 'delay-item';
                
                // Get line name
                let railwayName = '不明な路線';
                if (info['dc:title']) {
                    railwayName = typeof info['dc:title'] === 'object' && info['dc:title'].ja 
                                    ? info['dc:title'].ja 
                                    : info['dc:title'];
                } else if (info['odpt:railway']) {
                    railwayName = formatRailwayName(info['odpt:railway']);
                }

                // Get description text
                let descText = '情報がありません';
                if (info['odpt:trainInformationText']) {
                    if (typeof info['odpt:trainInformationText'] === 'object' && info['odpt:trainInformationText'].ja) {
                        descText = info['odpt:trainInformationText'].ja;
                    } else if (typeof info['odpt:trainInformationText'] === 'string') {
                        descText = info['odpt:trainInformationText'];
                    }
                }

                // Determine badge type
                let badgeClass = '';
                let badgeText = '遅延';
                if (descText.includes('見合') || descText.includes('運休')) {
                    badgeClass = 'stop';
                    badgeText = '運転見合わせ';
                }

                li.innerHTML = `
                    <div class="delay-item-header">
                        <span class="railway-name">${railwayName}</span>
                        <span class="status-badge ${badgeClass}">${badgeText}</span>
                    </div>
                    <p class="delay-text">${descText}</p>
                `;
                
                delayList.appendChild(li);
            });
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
