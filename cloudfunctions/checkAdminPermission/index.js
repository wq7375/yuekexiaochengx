// 云函数：checkAdminPermission
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  try {
    // 直接调用 login 云函数来检查权限
    const result = await cloud.callFunction({
      name: 'login',
      data: {
        // 传递空参数，避免创建新用户
        name: '',
        phone: ''
      }
    })
    
    console.log('login 云函数返回结果:', result)
    
    // 根据 login 函数的返回结果判断是否是管理员
    if (result.result && result.result.role === 'admin') {
      return { 
        isAdmin: true, 
        message: '管理员权限验证成功',
        role: result.result.role
      }
    } else {
      return { 
        isAdmin: false, 
        message: result.result.message || '无管理员权限',
        role: result.result.role || 'none'
      }
    }
  } catch (err) {
    console.error('权限检查失败:', err)
    return { 
      isAdmin: false, 
      message: '权限检查失败: ' + err.message,
      error: err.stack
    }
  }
}