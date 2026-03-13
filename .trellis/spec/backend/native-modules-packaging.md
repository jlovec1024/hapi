# 原生模块打包与动态导入限制

> 本文档记录原生模块（native addons）在 Bun 编译打包中的限制和解决方案。

---

## 问题背景

### 什么是原生模块？

原生模块是包含编译后的二进制代码（`.node`、`.so`、`.dylib`、`.dll`）的 Node.js/Bun 模块，通常用于：
- 性能敏感的操作（如图像处理、加密）
- 系统级功能（如终端 PTY、文件系统监控）
- 调用操作系统 API

**项目中的原生模块**：
- `bun-pty` - 终端伪终端（PTY）支持

---

## Bun 编译限制（已修正）

### ~~误解：原生模块无法打包~~ ✗

**之前的错误理解**：
> Bun 的 standalone executable 编译模式**不支持打包原生模块**

**真相**：
- ✅ `bun build --compile` **可以打包原生模块**（包括 `.so` 文件）
- ✅ `bun-pty` 专门支持编译模式（使用 `require()` 静态加载 `.so`）
- ✗ **动态 `import()` 在编译后的 executable 中不工作**

### 真正的限制：动态导入

```typescript
// ✗ 动态导入在编译后失败
const pty = await import('bun-pty')  // ERR_MODULE_NOT_FOUND

// ✓ 静态导入可以工作
import * as BunPty from 'bun-pty'  // 成功加载
```

**关键区别**：
- **静态 `import`**：编译时解析，`.so` 文件被打包进 executable
- **动态 `import()`**：运行时解析，在 `/$bunfs/root/` 虚拟文件系统中找不到模块

**验证证据**：
```bash
# 编译后的 executable 包含 .so 文件
$ strings zs | grep librust_pty
module.exports = "/$bunfs/root/librust_pty-6h2x94h6.so";

# 但动态 import() 仍然失败
$ /tmp/test-dynamic-import-exe
✗ Dynamic import failed:
  message: Cannot find package 'bun-pty' from '/$bunfs/root/test-dynamic-import-exe'
  code: ERR_MODULE_NOT_FOUND

# 静态 import 成功
$ /tmp/test-static-import-exe
✓ PTY created successfully
```

---

## 实际案例：终端功能不可用

### 问题表现

用户在使用编译后的 `zs` executable 时，尝试打开终端：

```
Web 前端 → Hub → CLI (executable)
                   ↓
            TerminalManager.create()
                   ↓
            检查 bunPtySpawn
                   ↓
            bunPtySpawn === null ✗
                   ↓
            返回错误："Terminal is unavailable in this runtime."
```

### 根因分析

**错误代码**（`cli/src/terminal/TerminalManager.ts:64-73`）：
```typescript
// ✗ 使用动态导入
let bunPtySpawn: BunPtySpawn | null = null

if (typeof Bun !== 'undefined') {
    try {
        const bunPty = await import('bun-pty')  // ✗ 动态导入在编译后失败
        bunPtySpawn = bunPty.spawn
    } catch (error) {
        logger.debug('[TERMINAL] Failed to load bun-pty module')
    }
}
```

**问题**：
1. 使用**动态 `import()`** 加载 `bun-pty`
2. 编译后的 executable 中，动态导入无法解析模块路径
3. `import()` 失败，错误被静默捕获（只记录 debug 日志）
4. `bunPtySpawn` 保持为 `null`
5. 用户尝试使用终端时收到错误

**正确代码**：
```typescript
// ✓ 使用静态导入
import * as BunPty from 'bun-pty'

const bunPtySpawn: BunPtySpawn | null = BunPty.spawn ?? null
```

### 验证方法

**测试动态导入（失败）**：
```bash
# 创建测试文件
cat > /tmp/test-dynamic.ts << 'EOF'
const pty = await import('bun-pty')
console.log("✓ loaded")
EOF

# 编译并测试
bun build --compile /tmp/test-dynamic.ts --outfile /tmp/test-dynamic
/tmp/test-dynamic

# 输出：
# ✗ bun-pty failed: Cannot find package 'bun-pty' from '/$bunfs/root/test-dynamic'
```

**测试静态导入（成功）**：
```bash
# 创建测试文件
cat > /tmp/test-static.ts << 'EOF'
import { spawn } from 'bun-pty'
console.log("✓ loaded, spawn type:", typeof spawn)
EOF

# 编译并测试
bun build --compile /tmp/test-static.ts --outfile /tmp/test-static
/tmp/test-static

# 输出：
# ✓ loaded, spawn type: function
```

---

## 解决方案

### 方案 1：使用静态导入（推荐 ✅）

**将动态 `import()` 改为静态 `import`**：

```typescript
// ✗ 错误：动态导入
let bunPtySpawn = null
if (typeof Bun !== 'undefined') {
    try {
        const bunPty = await import('bun-pty')
        bunPtySpawn = bunPty.spawn
    } catch (error) {
        logger.debug('[TERMINAL] Failed to load bun-pty')
    }
}

// ✓ 正确：静态导入
import * as BunPty from 'bun-pty'

const bunPtySpawn = BunPty.spawn ?? null
```

**优点**：
- 原生模块被正确打包进 executable
- 编译时解析，运行时直接可用
- 代码更简洁

**缺点**：
- 无法条件加载（但对于必需的依赖，这不是问题）

### 方案 2：使用 `require()`（备选）

如果需要条件加载，可以使用 `require()`：

```typescript
let bunPtyModule = null
try {
    if (typeof Bun !== 'undefined') {
        // @ts-ignore
        bunPtyModule = require('bun-pty')
    }
} catch (error) {
    logger.error('[TERMINAL] Failed to load bun-pty')
}

const bunPtySpawn = bunPtyModule?.spawn ?? null
```

**注意**：`require()` 在 Bun 中也是静态解析的，可以在编译后工作。

### 方案 3：编译时检测（预防性）

在 `cli/scripts/build-executable.ts` 中添加检查，确保不会误用动态导入：

```typescript
function checkDynamicImports(projectRoot: string): void {
    // 扫描代码中的动态 import()
    const files = glob.sync('src/**/*.ts', { cwd: projectRoot })

    for (const file of files) {
        const content = readFileSync(join(projectRoot, file), 'utf-8')

        // 检测动态导入原生模块
        if (content.includes("import('bun-pty')")) {
            throw new Error(
                `Dynamic import of native module detected in ${file}.\n` +
                `Use static import instead: import * as BunPty from 'bun-pty'`
            )
        }
    }
}
```

---

## 最佳实践

### 开发新功能时

在添加原生模块依赖前，检查：

- [ ] 这个模块是否包含原生代码？（查看 `node_modules/` 中是否有 `.node`/`.so` 文件）
- [ ] 是否使用**静态 `import`** 而不是动态 `import()`？
- [ ] 是否在编译后测试过功能？
- [ ] 是否有纯 JS 替代方案？

### 原生模块导入规则

**✅ 正确做法**：
```typescript
// 静态导入
import * as NativeModule from 'native-module'
import { specificFunction } from 'native-module'

// 或使用 require()
const nativeModule = require('native-module')
```

**✗ 错误做法**：
```typescript
// 动态导入（在编译后不工作）
const module = await import('native-module')

// 字符串拼接导入（无法静态分析）
const moduleName = 'native-module'
const module = await import(moduleName)
```

### 识别原生模块

```bash
# 查找项目中的原生模块
find node_modules -name "*.node" -o -name "*.so" -o -name "*.dylib" -o -name "*.dll"

# 检查特定模块
ls -la node_modules/bun-pty/rust-pty/target/release/
```

### 验证编译后的功能

```bash
# 1. 编译
bun run build:exe

# 2. 检查 .so 是否被打包
strings dist-exe/*/zs | grep "librust_pty"

# 3. 测试功能
# 创建测试脚本验证关键功能
```

### 文档化限制

在 README 中明确说明：

```markdown
## 开发注意事项

### 原生模块使用规范

项目使用 `bun-pty` 原生模块提供终端功能。为确保编译后正常工作：

- ✅ 使用静态 `import` 导入原生模块
- ✗ 不要使用动态 `import()` 导入原生模块
- ✓ 编译后测试关键功能
```

---

## 相关资源

- [Bun 编译文档](https://bun.sh/docs/bundler/executables)
- [bun-pty GitHub](https://github.com/sursaone/bun-pty)
- [Node.js 原生模块](https://nodejs.org/api/addons.html)
- 项目修复: `cli/src/terminal/TerminalManager.ts` - 将动态导入改为静态导入

---

## 总结

### 关键洞察

1. **原生模块可以被打包**：`bun build --compile` 支持打包 `.so` 文件
2. **动态导入不工作**：`import()` 在编译后无法解析模块路径
3. **静态导入是解决方案**：使用 `import` 或 `require()` 静态加载

### 修复清单

- [x] 将 `TerminalManager.ts` 中的动态 `import()` 改为静态 `import`
- [x] 更新文档说明真正的限制
- [ ] 添加编译时检测防止误用动态导入
- [ ] 在 CI/CD 中添加编译后功能测试

### 教训

> **不要假设限制，要验证假设。**

浮浮酱最初错误地认为"原生模块无法打包"，但通过实验发现：
- ✅ 原生模块**可以**打包
- ✗ **动态导入**才是真正的问题

**调查方法**：
1. 创建最小测试用例
2. 分别测试动态导入和静态导入
3. 检查编译后的 executable 内容
4. 验证假设，找到真正根因
