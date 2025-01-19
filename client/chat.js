class ChatSystem {
    constructor() {
        console.log("ChatSystem initialized");
        this.messages = [];
        this.chatBox = null;
        this.chatInput = null;
        this.isTyping = false;
        this.init();
        
        // 监听游戏状态
        this.gameStarted = false;
        this.checkGameInterval = setInterval(() => {
            const canvas = document.getElementById('canvas');
            const loading = document.getElementById('loading');
            const textInput = document.getElementById('textInput');
            
            // 只在进入游戏且不在名字输入界面时显示聊天框
            if (canvas && !loading.innerText && !textInput.style.display && !this.gameStarted) {
                this.gameStarted = true;
                this.chatBox.style.display = 'block';
            }
            // 返回主页或在名字输入界面时隐藏聊天框
            else if ((!canvas || loading.innerText || textInput.style.display) && this.gameStarted) {
                this.gameStarted = false;
                this.chatBox.style.display = 'none';
                this.stopTyping();
            }
        }, 100);
    }

    init() {
        this.chatBox = document.createElement('div');
        this.chatBox.className = 'chat-box';
        
        this.messageArea = document.createElement('div');
        this.messageArea.className = 'message-area';
        
        this.chatInput = document.createElement('input');
        this.chatInput.className = 'chat-input';
        this.chatInput.placeholder = '按回车开始输入...';
        
        // 修改事件监听逻辑
        this.chatInput.addEventListener('keydown', (e) => {
            e.stopPropagation(); // 阻止事件冒泡到document
            if (e.key === 'Enter') {
                if (this.chatInput.value.trim()) {
                    this.sendMessage(this.chatInput.value);
                    this.stopTyping();
                }
            } else if (e.key === 'Escape') {
                this.stopTyping();
            }
        });

        // 修改全局回车事件
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !this.isTyping) {
                e.preventDefault();
                this.startTyping();
            }
        });

        // 点击输入框外退出输入状态
        document.addEventListener('click', (e) => {
            if (this.isTyping && !this.chatBox.contains(e.target)) {
                this.stopTyping();
            }
        });
        
        this.chatBox.appendChild(this.messageArea);
        this.chatBox.appendChild(this.chatInput);
        document.body.appendChild(this.chatBox);
        this.chatBox.style.display = 'none'; // 初始时隐藏聊天框
    }

    startTyping() {
        this.isTyping = true;
        this.chatInput.focus();
        this.chatInput.placeholder = '输入消息...';
        window.setTyping?.(true);
    }

    stopTyping() {
        this.isTyping = false;
        this.chatInput.blur();
        this.chatInput.value = '';
        this.chatInput.placeholder = '按回车开始输入...';
        window.setTyping?.(false);
    }

    sendMessage(text) {
        this.addMessage('[Local]', text);
        this.chatInput.value = '';
    }

    addMessage(sender, text) {
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';
        messageElement.innerHTML = `<span class="sender">${sender}</span> ${text}`;
        this.messageArea.appendChild(messageElement);
        this.messageArea.scrollTop = this.messageArea.scrollHeight;
    }
}

export { ChatSystem }; 