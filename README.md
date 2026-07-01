# Money Planner

「気付いたらお金が消えている」を防ぐための、計画型の家計簿アプリです。
月給・毎月の固定支払い・貯金目標を登録すると、**今月・今週・今日いくらまで使えるか** を自動計算し、日々の支出を記録するたびに残り予算が更新されます。

## 特徴

- **貯金から逆算した予算**: 「4ヶ月後までに20万円」といった目標から、月あたり必要な貯金額を割り出し、月給から差し引いた残りを変動費予算として計算します。
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
| `/settings` | 月給・貯金目標・固定支払いの登録 |

## 計算ロジック

```
月あたりの貯金       = 目標金額 ÷ 目標日までの残り月数
今月の変動費予算     = 月給 − 固定支払い合計 − 月あたりの貯金
今月の残り予算       = 今月の変動費予算 − 今月の消費合計
1日に使える額        = 今月の残り予算 ÷ 今月の残り日数
1週間に使える額      = 1日に使える額 × 7
今日の残り           = 1日に使える額 − 今日の消費
```

支出が積み重なるほど残り予算が減り、日割り額も自動で再計算されます。予算超過時はカードが赤く表示されます。

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
| `profiles` | `user_id`, `monthly_salary` | 1ユーザ1行、月給を保存 |
| `savings_goals` | `title`, `target_amount`, `target_date` | 貯金目標（現状はアクティブ1件を利用） |
| `monthly_bills` | `name`, `amount` | 家賃・サブスクなど毎月の固定支払い |
| `expenses` | `name`, `amount`, `spent_on` | 日々の消費（家計簿） |

すべてのテーブルはRLSで自分のレコードのみ参照・更新可能。

## 推奨開発環境

[VS Code](https://code.visualstudio.com/) + [Vue (Official / Volar)](https://marketplace.visualstudio.com/items?itemName=Vue.volar)（Vetur は無効化してください）
