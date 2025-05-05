document.addEventListener('DOMContentLoaded', function() {
  // 获取DOM元素
  const loginUrlInput = document.getElementById('loginUrl');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const autoLoginCheckbox = document.getElementById('autoLogin');
  const saveButton = document.getElementById('saveBtn');
  const testButton = document.getElementById('testBtn');
  const statusDiv = document.getElementById('status');

  // 加载保存的设置
  loadSettings();

  // 保存按钮点击事件
  saveButton.addEventListener('click', function() {
    saveSettings();
  });

  // 测试按钮点击事件
  testButton.addEventListener('click', function() {
    testLogin();
  });

  // 加载保存的设置
  function loadSettings() {
    chrome.storage.sync.get([
      'loginUrl',
      'username',
      'password',
      'usernameSelector',
      'passwordSelector',
      'submitSelector',
      'autoLogin'
    ], function(result) {
      loginUrlInput.value = result.loginUrl || '';
      usernameInput.value = result.username || '';
      passwordInput.value = result.password || '';
      autoLoginCheckbox.checked = result.autoLogin !== false;
    });
  }

  // 保存设置
  function saveSettings() {
    const settings = {
      loginUrl: loginUrlInput.value.trim(),
      username: usernameInput.value.trim(),
      password: passwordInput.value.trim(),
      usernameSelector: '#username',
      passwordSelector: '#password',
      submitSelector: 'input[type="submit"], button[type="submit"], #login-button, .login-button, .btn-login, #login',
      autoLogin: autoLoginCheckbox.checked
    };

    // 验证必填字段
    if (!settings.loginUrl) {
      showStatus('请输入登录网址', 'error');
      return;
    }

    if (!settings.username) {
      showStatus('请输入用户名', 'error');
      return;
    }

    if (!settings.password) {
      showStatus('请输入密码', 'error');
      return;
    }

    // 保存到Chrome存储
    chrome.storage.sync.set(settings, function() {
      showStatus('设置已保存', 'success');
      // 通知后台脚本更新设置
      chrome.runtime.sendMessage({ action: 'settingsUpdated' });
    });
  }

  // 测试登录
  function testLogin() {
    const settings = {
      loginUrl: loginUrlInput.value.trim(),
      username: usernameInput.value.trim(),
      password: passwordInput.value.trim(),
      usernameSelector: '#username',
      passwordSelector: '#password',
      submitSelector: 'input[type="submit"], button[type="submit"], #login-button, .login-button, .btn-login, #login'
    };

    // 验证必填字段
    if (!settings.loginUrl || !settings.username || !settings.password) {
      showStatus('请填写所有必填字段', 'error');
      return;
    }

    showStatus('正在测试登录...', 'info');

    // 发送消息给后台脚本执行登录
    chrome.runtime.sendMessage(
      { action: 'testLogin', settings: settings },
      function(response) {
        if (response && response.success) {
          showStatus('登录测试成功', 'success');
        } else {
          showStatus('登录测试失败: ' + (response ? response.error : '未知错误'), 'error');
        }
      }
    );
  }

  // 显示状态信息
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
    
    // 3秒后清除状态
    setTimeout(function() {
      statusDiv.textContent = '';
      statusDiv.className = 'status';
    }, 3000);
  }
});