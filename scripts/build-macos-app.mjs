// Why: assemble and locally sign a macOS bundle from the Swift host and Rust daemon packages.
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const source = join(root, 'apps/macos')
const contents = join(source, 'dist/Yiru.app/Contents')
const iconSource = join(source, 'Sources/YiruMenuBar/Resources/Yiru.icns')
const binaryDirectory = execFileSync('swift', ['build', '-c', 'release', '--show-bin-path'], {
  cwd: source,
  encoding: 'utf8'
}).trim()
rmSync(join(source, 'dist/Yiru.app'), { recursive: true, force: true })
mkdirSync(join(contents, 'MacOS'), { recursive: true })
mkdirSync(join(contents, 'Resources'), { recursive: true })
cpSync(iconSource, join(contents, 'Resources/Yiru.icns'))
cpSync(join(source, 'Info.plist'), join(contents, 'Info.plist'))
cpSync(join(binaryDirectory, 'YiruMenuBar'), join(contents, 'MacOS/YiruMenuBar'))
cpSync(join(root, 'apps/daemon/target/release/yiru'), join(contents, 'MacOS/yiru'))
cpSync(
  join(binaryDirectory, 'YiruMenuBar_YiruMenuBar.bundle'),
  join(contents, 'Resources/YiruMenuBar_YiruMenuBar.bundle'),
  { recursive: true }
)
for (const path of ['MacOS/yiru', 'MacOS/YiruMenuBar']) {
  execFileSync('codesign', ['--force', '--sign', '-', join(contents, path)], { stdio: 'inherit' })
}
execFileSync('codesign', ['--force', '--sign', '-', dirname(contents)], { stdio: 'inherit' })
console.log(`Built local, ad-hoc signed app: ${dirname(contents)}`)
