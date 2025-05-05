// 全局变量存储设置
let settings = {
  loginUrl: '',
  username: '',
  password: '',
  usernameSelector: '#username',
  passwordSelector: '#password',
  submitSelector: 'input[type="submit"], button[type="submit"], #login-button, .login-button',
  autoLogin: true
};

// 网络状态检查间隔（毫秒）
const CHECK_INTERVAL = 30000; // 30秒

// 初始化
chrome.runtime.onInstalled.addListener(function() {
  console.log('Login Helper 插件已安装');
  loadSettings();
  setupNetworkCheck();
});

// 浏览器启动时检查网络
chrome.runtime.onStartup.addListener(function() {
  console.log('浏览器启动，检查网络状态...');
  loadSettings();
  // 延迟一下，确保设置已加载
  setTimeout(function() {
    checkNetworkAndLogin();
  }, 2000);
});

// 接收来自popup的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('收到消息:', request.action);
  
  if (request.action === 'settingsUpdated') {
    loadSettings();
    sendResponse({success: true});
  } 
  else if (request.action === 'testLogin') {
    performLogin(request.settings, true)
      .then(result => sendResponse({success: true}))
      .catch(error => sendResponse({success: false, error: error.message}));
    return true; // 异步响应
  }
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
    settings.loginUrl = result.loginUrl || '';
    settings.username = result.username || '';
    settings.password = result.password || '';
    settings.usernameSelector = result.usernameSelector || '#username';
    settings.passwordSelector = result.passwordSelector || '#password';
    settings.submitSelector = result.submitSelector || 'input[type="submit"], button[type="submit"], #login-button, .login-button, .btn-login, #login';
    settings.autoLogin = result.autoLogin !== false;
    
    console.log('设置已加载', settings.loginUrl, settings.autoLogin);
  });
}

// 设置网络检查
function setupNetworkCheck() {
  // 创建定时任务
  chrome.alarms.create('networkCheck', { periodInMinutes: CHECK_INTERVAL / 60000 });
  
  // 监听定时任务
  chrome.alarms.onAlarm.addListener(function(alarm) {
    if (alarm.name === 'networkCheck') {
      checkNetworkAndLogin();
    }
  });
  
  // 立即执行一次检查
  checkNetworkAndLogin();
  
  // 监听标签页更新事件，用于检测网络状态变化
  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete') {
      // 当页面加载完成时，检查是否需要登录
      checkNetworkAndLogin();
    }
  });
}

// 检查网络并登录
async function checkNetworkAndLogin() {
  console.log('检查网络状态...');
  
  if (!settings.autoLogin || !settings.loginUrl || !settings.username || !settings.password) {
    console.log('自动登录未启用或设置不完整');
    return;
  }
  
  try {
    // 检查网络连接
    const isConnected = await checkInternetConnection();
    console.log('网络连接状态:', isConnected);
    
    if (!isConnected) {
      console.log('网络未连接，尝试登录...');
      await performLogin(settings);
    } else {
      console.log('网络已连接，无需登录');
      // 不再显示成功页面
    }
  } catch (error) {
    console.error('网络检查错误:', error);
  }
}

// 检查互联网连接
function checkInternetConnection() {
  return new Promise((resolve) => {
    // 尝试请求一个可靠的外部资源来检查网络连接
    fetch('https://www.baidu.com', { mode: 'no-cors', cache: 'no-store' })
      .then(() => resolve(true))
      .catch(() => resolve(false));
  });
}

// 显示网络连接成功页面
function showSuccessPage() {
  // 检查是否已有成功页面打开
  chrome.tabs.query({url: chrome.runtime.getURL('success.html')}, function(tabs) {
    if (tabs.length > 0) {
      // 如果已有成功页面，则切换到该页面
      chrome.tabs.update(tabs[0].id, {active: true});
    } else {
      // 否则打开新的成功页面
      chrome.tabs.create({url: chrome.runtime.getURL('success.html'), active: true});
    }
  });
}

// 执行登录
async function performLogin(loginSettings, isTest = false) {
  return new Promise(async (resolve, reject) => {
    try {
      // 检查是否已有登录页面打开
      const tabs = await chrome.tabs.query({});
      const loginTab = tabs.find(tab => tab.url && tab.url.includes(loginSettings.loginUrl));
      
      if (loginTab) {
        // 如果已有登录页面，则切换到该页面并填写登录信息
        await chrome.tabs.update(loginTab.id, { active: true });
        
        // 检查页面状态
        const tabInfo = await chrome.tabs.get(loginTab.id);
        if (tabInfo.status !== 'complete' || tabInfo.url.startsWith('chrome-error://')) {
          console.log('现有登录页面状态异常，尝试重新加载...');
          await chrome.tabs.reload(loginTab.id);
          
          // 等待页面重新加载完成
          await new Promise(waitResolve => {
            const reloadListener = function(tabId, changeInfo) {
              if (tabId === loginTab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(reloadListener);
                waitResolve();
              }
            };
            chrome.tabs.onUpdated.addListener(reloadListener);
            
            // 设置超时，防止无限等待
            setTimeout(() => {
              chrome.tabs.onUpdated.removeListener(reloadListener);
              waitResolve();
            }, 10000);
          });
        }
        
        // 尝试填写登录表单
        try {
          await fillLoginForm(loginTab.id, loginSettings);
          resolve(true);
        } catch (fillError) {
          console.error('填写登录表单失败，尝试重新加载页面:', fillError);
          await chrome.tabs.reload(loginTab.id);
          
          // 等待重新加载完成后再次尝试
          setTimeout(async () => {
            try {
              await fillLoginForm(loginTab.id, loginSettings);
              resolve(true);
            } catch (retryError) {
              console.error('重试填写登录表单失败:', retryError);
              reject(retryError);
            }
          }, 2000);
        }
      } else {
        // 否则打开新的登录页面
        const newTab = await chrome.tabs.create({ url: loginSettings.loginUrl, active: true });
        
        // 等待页面加载完成
        let loadAttempts = 0;
        const maxAttempts = 3;
        
        const attemptLogin = function(attempt) {
          return new Promise((attemptResolve, attemptReject) => {
            const pageLoadListener = function(tabId, changeInfo, tab) {
              if (tabId === newTab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(pageLoadListener);
                
                // 检查页面是否为错误页面
                chrome.tabs.get(newTab.id, async (tabInfo) => {
                  if (tabInfo.url.startsWith('chrome-error://')) {
                    console.log(`加载登录页面失败(尝试 ${attempt}/${maxAttempts})，页面显示错误`);
                    
                    if (attempt < maxAttempts) {
                      console.log(`尝试重新加载登录页面...`);
                      chrome.tabs.reload(newTab.id);
                      setTimeout(() => attemptLogin(attempt + 1).then(attemptResolve).catch(attemptReject), 2000);
                    } else {
                      attemptReject(new Error('多次尝试后仍无法加载登录页面'));
                    }
                  } else {
                    // 延迟一下，确保页面元素已加载
                    setTimeout(async () => {
                      try {
                        await fillLoginForm(newTab.id, loginSettings);
                        attemptResolve(true);
                      } catch (fillError) {
                        console.error('填写登录表单失败:', fillError);
                        
                        if (attempt < maxAttempts) {
                          console.log(`尝试重新填写登录表单(尝试 ${attempt}/${maxAttempts})...`);
                          setTimeout(() => attemptLogin(attempt + 1).then(attemptResolve).catch(attemptReject), 2000);
                        } else {
                          attemptReject(fillError);
                        }
                      }
                    }, 2000);
                  }
                });
              }
            };
            
            chrome.tabs.onUpdated.addListener(pageLoadListener);
            
            // 设置超时，防止无限等待
            setTimeout(() => {
              chrome.tabs.onUpdated.removeListener(pageLoadListener);
              if (attempt < maxAttempts) {
                console.log(`页面加载超时(尝试 ${attempt}/${maxAttempts})，重试...`);
                chrome.tabs.reload(newTab.id);
                setTimeout(() => attemptLogin(attempt + 1).then(attemptResolve).catch(attemptReject), 2000);
              } else {
                attemptReject(new Error('多次尝试后页面加载超时'));
              }
            }, 15000);
          });
        };
        
        try {
          await attemptLogin(1);
          resolve(true);
        } catch (error) {
          reject(error);
        }
      }
    } catch (error) {
      console.error('登录过程出错:', error);
      reject(error);
    }
  });
}

// 填写登录表单
async function fillLoginForm(tabId, loginSettings) {
  return new Promise(async (resolve, reject) => {
    try {
      // 先检查页面状态是否正常
      const tabInfo = await chrome.tabs.get(tabId);
      if (tabInfo.status !== 'complete' || tabInfo.url.startsWith('chrome-error://')) {
        console.log('页面未完全加载或显示错误页面，等待重试...');
        // 等待一段时间后重试
        setTimeout(async () => {
          try {
            const newTabInfo = await chrome.tabs.get(tabId);
            if (newTabInfo.status === 'complete' && !newTabInfo.url.startsWith('chrome-error://')) {
              // 页面已正常加载，继续执行
              await executeLoginScript(tabId, loginSettings);
              resolve(true);
            } else {
              // 页面仍然有问题，尝试重新加载
              await chrome.tabs.reload(tabId);
              setTimeout(async () => {
                try {
                  await executeLoginScript(tabId, loginSettings);
                  resolve(true);
                } catch (reloadError) {
                  console.error('重新加载后填写表单出错:', reloadError);
                  reject(reloadError);
                }
              }, 2000);
            }
          } catch (retryError) {
            console.error('重试填写表单出错:', retryError);
            reject(retryError);
          }
        }, 2000);
      } else {
        // 页面状态正常，直接执行脚本
        await executeLoginScript(tabId, loginSettings);
        resolve(true);
      }
    } catch (error) {
      console.error('填写登录表单出错:', error);
      reject(error);
    }
  });
}

// 执行登录脚本
async function executeLoginScript(tabId, loginSettings) {
  return new Promise(async (resolve, reject) => {
    try {
      // 注入脚本填写表单
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        function: injectLoginScript,
        args: [loginSettings]
      });
      
      // 检查脚本执行结果
      if (results && results.length > 0 && results[0].result === true) {
        resolve(true);
      } else {
        reject(new Error('登录脚本执行失败'));
      }
    } catch (error) {
      console.error('执行登录脚本出错:', error);
      reject(error);
    }
  });
}

// 注入到页面的登录脚本
function injectLoginScript(settings) {
  try {
    console.log('注入登录脚本', settings);
    
    // 检查页面是否为错误页面
    if (document.title.includes('错误') || document.body.textContent.includes('无法访问此网站') || 
        document.body.textContent.includes('ERR_') || document.body.textContent.includes('error')) {
      console.error('当前页面是错误页面，无法执行登录脚本');
      return false;
    }
    
    // 等待DOM完全加载
    if (document.readyState !== 'complete') {
      console.log('页面尚未完全加载，等待...');
      return false;
    }
    
    // 查找用户名输入框
    const usernameInput = document.querySelector(settings.usernameSelector);
    if (!usernameInput) {
      console.error('未找到用户名输入框:', settings.usernameSelector);
      // 尝试使用更通用的选择器
      const possibleUsernameInputs = document.querySelectorAll('input[type="text"], input[type="email"], input:not([type])');
      if (possibleUsernameInputs.length > 0) {
        console.log('尝试使用备选用户名输入框');
        for (const input of possibleUsernameInputs) {
          if (input.id.toLowerCase().includes('user') || 
              input.name.toLowerCase().includes('user') || 
              input.placeholder.toLowerCase().includes('用户') || 
              input.placeholder.toLowerCase().includes('账号')) {
            usernameInput = input;
            break;
          }
        }
      }
      
      if (!usernameInput) {
        return false;
      }
    }
    
    // 查找密码输入框
    const passwordInput = document.querySelector(settings.passwordSelector);
    if (!passwordInput) {
      console.error('未找到密码输入框:', settings.passwordSelector);
      // 尝试使用更通用的选择器
      const possiblePasswordInputs = document.querySelectorAll('input[type="password"]');
      if (possiblePasswordInputs.length > 0) {
        console.log('尝试使用备选密码输入框');
        passwordInput = possiblePasswordInputs[0];
      } else {
        return false;
      }
    }
    
    // 填写用户名和密码
    usernameInput.value = settings.username;
    passwordInput.value = settings.password;
    
    // 触发输入事件，以便可能的验证脚本能够检测到输入变化
    usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
    passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
    
    // 查找提交按钮
    let submitButton = document.querySelector(settings.submitSelector);
    if (!submitButton) {
      console.log('使用默认选择器未找到登录按钮，尝试备选选择器');
      // 尝试使用更通用的选择器
      const possibleButtons = document.querySelectorAll('button, input[type="submit"], a.btn, .login, .submit');
      for (const btn of possibleButtons) {
        const text = btn.textContent.toLowerCase() || btn.value.toLowerCase() || '';
        if (text.includes('登录') || text.includes('login') || text.includes('sign in')) {
          submitButton = btn;
          break;
        }
      }
    }
    
    if (submitButton) {
      // 点击提交按钮
      submitButton.click();
      console.log('已点击登录按钮');
    } else {
      console.error('未找到登录按钮:', settings.submitSelector);
      // 尝试提交表单
      const form = usernameInput.closest('form') || passwordInput.closest('form');
      if (form) {
        form.submit();
        console.log('已提交表单');
      } else {
        console.error('未找到表单，无法自动登录');
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('执行登录脚本时发生错误:', error);
    return false;
  }
}