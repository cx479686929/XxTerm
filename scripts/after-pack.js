const { execSync } = require('child_process')
const path = require('path')

/**
 * electron-builder afterPack 钩子
 *
 * 背景：本机没有 Developer ID 证书，electron-builder 会跳过签名。
 * 但打包过程修改了 Info.plist 并注入了 app.asar，导致继承自 Electron
 * 原始二进制的 linker 签名失效（code has no resources but signature
 * indicates they must be present）。
 *
 * macOS 对签名无效的应用会拒绝授予 / 记住隐私权限（例如「本地网络」
 * 权限），因此这里在打包完成后做一次 ad-hoc 重新签名，让 Info.plist
 * 与资源一起被签名封存。
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)

  console.log(`  • ad-hoc signing  app=${appPath}`)
  try {
    execSync(
      `codesign --force --deep --sign - --identifier ${context.packager.appInfo.id} "${appPath}"`,
      { stdio: 'inherit' }
    )
    console.log('  • ad-hoc signing  done')
  } catch (err) {
    console.warn(`  ⚠ ad-hoc signing failed: ${err.message}`)
  }
}
