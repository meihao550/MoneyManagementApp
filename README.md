# Money Planner

「気付いたらお金が消えている」を防ぐための、計画型の家計簿アプリです。
**銀行の預金残高**を起点に、毎月の固定支払いと貯金目標を差し引いて、**目標日（または月末）まで1日いくらまで使えるか** を自動計算します。

## 特徴

- **預金から逆算した予算**: 現在の口座残高を出発点に、目標日までに払う固定費と目標分を差し引いて、使える額を割り出します。
- **月 / 週 / 日で使える額を可視化**: ダッシュボードで残り予算を粒度別に確認できます。
- **家計簿機能**: 日々の支出をワンタッチで記録。使うほど残り予算が減り、今日の予算超過もひと目で分かります。
- **OAuthログイン**: Supabase Auth（GitHub / Google）で認証、データはユーザごとにRLSで保護。

## 技術スタック

- フロントエンド: Vue 3 (`<script setup>`) + Vite + TypeScript
- 状態管理: Pinia
- ルーティング: Vue Router
- スタイリング: Tailwind CSS v4
- バックエンド: Supabase（PostgreSQL + Auth + RLS）

## 画面構成

| ルート | 内容 |
| --- | --- |
| `/login` | GitHub / Google でのOAuthログイン |
| `/` | ダッシュボード（残り予算・今日の状況・支出入力・家計簿） |
| `/settings` | 預金残高・貯金目標・固定支払いの登録 |

## 計算ロジック

計算の期限（horizon）は「貯金目標があれば目標日」、「無ければ今月末」です。

```
期限までの残り月数   = 期限までの日数 ÷ 30.4375
期限までの固定費     = 固定支払い合計 × 期限までの残り月数
使える残り           = 銀行預金 − 目標分 − 期限までの固定費 − 今月の消費合計
1日に使える額        = 使える残り ÷ 期限までの日数
1週間に使える額      = 1日に使える額 × 7
今日の残り           = 1日に使える額 − 今日の消費
```

預金残高がすべての起点なので、給料日・引き落とし後などに残高を更新すると計画が最新化されます。予算超過時はカードが赤く表示されます。

## セットアップ

### 1. 依存関係のインストール

```sh
npm install
```

### 2. Supabaseプロジェクトの準備

1. [Supabase](https://supabase.com) で新規プロジェクトを作成
2. SQL Editor で `supabase/schema.sql` を実行（何度でも安全に再実行可能）
3. Authentication → Providers で GitHub / Google を有効化し、リダイレクトURLを登録
4. プロジェクトルートに `.env.local` を作成

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-public-key
```

### 3. 開発サーバ起動

```sh
npm run dev
```

## スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | Vite開発サーバ起動 |
| `npm run build` | 型チェック + プロダクションビルド |
| `npm run type-check` | vue-tsc による型チェックのみ |
| `npm run lint` | oxlint + ESLint |
| `npm run format` | Prettier |

## ディレクトリ構成

```
src/
├── App.vue
├── main.ts
├── assets/main.css        # Tailwindエントリ
├── components/            # HeaderComponent など共通UI
├── views/                 # DashboardView / SettingsView / LoginView
├── stores/                # Pinia: auth, finance
├── router/                # 認証ガード付きルータ
└── lib/                   # supabaseClient, types, format
supabase/
└── schema.sql             # profiles / savings_goals / monthly_bills / expenses
```

## データモデル

| テーブル | 主なカラム | 用途 |
| --- | --- | --- |
| `profiles` | `user_id`, `bank_balance` | 1ユーザ1行、銀行の預金残高を保存 |
| `savings_goals` | `title`, `target_amount`, `target_date` | 貯金目標（現状はアクティブ1件を利用） |
| `monthly_bills` | `name`, `amount` | 家賃・サブスクなど毎月の固定支払い |
| `expenses` | `name`, `amount`, `spent_on` | 日々の消費（家計簿） |

すべてのテーブルはRLSで自分のレコードのみ参照・更新可能。

## 推奨開発環境

[VS Code](https://code.visualstudio.com/) + [Vue (Official / Volar)](https://marketplace.visualstudio.com/items?itemName=Vue.volar)（Vetur は無効化してください）
