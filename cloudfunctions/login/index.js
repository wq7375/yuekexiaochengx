// 云函数 login
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { name='注意！程序可能有漏洞', phone = '请联系开发者！'} = event

  // 先查是否已有当前 openid
  var logging = 'none';
  logging='context openid is: '+wxContext.OPENID+'\n'+'start searching openid, name is: '+name+'\n'+'phone is: '+phone+'\n\n'; // 加载日志，可以删
  const userRes = await db.collection('people').where({
    _openid: wxContext.OPENID
  }).get()

  if (userRes.data.length > 0) {
    logging=logging+'openid found, returning is:\n'+'role= '+userRes.data[0].role+'\n'+'openid='+userRes.data[0]._openid+'\n\n'; // 日志，可删
    return {
      role: userRes.data[0].role,
      openid: userRes.data[0]._openid,
      LogInfo: logging
    }
  }

  logging = logging+'no openid found, checking people lists...\n\n'; // 日志，可删
  // 查是否已有任何用户
  const allRes = await db.collection('people').get()

  if (allRes.data.length === 0) {
    // 第一个用户 → 管理员
    logging=logging+'no people in the list, setting admin...\n\n'; // 日志，可删
    await db.collection('people').add({
      data: {
        name,
        phone,
        role: 'admin',
        _openid: wxContext.OPENID,
        cards: []
      }
    })
    return { 
      role: 'admin',
      LogInfo: logging
    }
  }

  // 按电话+姓名匹配
  logging = logging +'searching by name and phone...\n'; // 日志，可删
  const matchRes = await db.collection('people').where({
    name,
    phone
  }).get()

  if (matchRes.data.length > 0) {
    // 更新 openid
    logging = logging+'people found, old openid is:\n'+matchRes.data[0]._openid+'\n\n'; //日志，可删
    new_openid = wxContext.OPENID;
    await db.collection('people').doc(matchRes.data[0]._id).update({
      data: { _openid: new_openid }
    })
    return { 
      role: matchRes.data[0].role,
      openid: new_openid,
      LogInfo: logging
    }
  }

  // 没匹配到
  logging=logging+'no one found!\n\n';
  return { role: 'none',
    LogInfo: logging
  }
}
