// 云函数：checkAdminPermission
const cloud = require('wx-server-sdk')
cloud.init()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()
  
  try {
    // 查询people集合中当前用户的信息
    const userRes = await db.collection('people')
      .where({
        _openid: wxContext.OPENID
      })
      .get()
    
    if (userRes.data.length === 0) {
      return { isAdmin: false, message: '用户未注册' }
    }
    
    const userInfo = userRes.data[0]
    // 根据role字段判断是否为管理员
    const isAdmin = userInfo.role === 'admin'
    
    return { isAdmin, userInfo }
  } catch (err) {
    console.error('权限检查失败:', err)
    return { isAdmin: false, message: '权限检查失败' }
  }
}