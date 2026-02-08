# 🚀 AI Microservice Health Monitor UI + Analytics  
Hackathon Project built with **Tambo Generative UI**

## 📌 Overview

Modern microservice systems often suffer from hidden reliability issues such as:

- Sudden latency spikes  
- Increased error rates  
- Unhealthy service dependencies  
- Difficult-to-debug production incidents  

This project solves that problem by providing an **AI-powered monitoring assistant** that helps engineers quickly understand which services are risky and why.

Using **Tambo’s Generative UI**, the system converts live service metrics into interactive insights and analytics dashboards.

---

## 🎯 Problem Statement

In distributed microservice architectures, teams struggle to answer:

- Which services are currently unhealthy?
- What is causing latency or error spikes?
- Which services are becoming risky over time?
- How can engineers debug faster during incidents?

Traditional dashboards show raw metrics, but do not provide intelligent explanations.

---

## 💡 Solution

The **AI Microservice Health Monitor** provides:

✅ Real-time service health visibility  
✅ Risk scoring using latency + errors + traffic  
✅ AI-generated explanations of risky services  
✅ Interactive monitoring experience powered by Tambo UI  

---

## ✨ Key Features

### 🟢 Health Monitoring Dashboard
- Displays service status (Healthy / Warning / Critical)
- Tracks real-time availability

### 📊 Analytics & Metrics Insights
For each service, the system analyzes:

- **Error Rate**
- **p95 Latency**
- **Traffic Volume**
- **Risk Score**

### ⚠️ Risky Services Ranking
AI automatically ranks the top risky services:

- Explains why each service is risky  
- Highlights high latency or failure patterns  

Example output:

- Service A → High error rate + traffic surge  
- Service B → p95 latency spike  

### 🤖 Interactive AI Chat Assistant
Users can ask:

- “Which services are unhealthy right now?”
- “Explain why payment-service is risky”
- “Compare last 15 min vs last 1 hour”

The assistant responds with **Generative UI components**, not just plain text.

---

## 🏗️ Architecture

```text
Frontend (Next.js + Tambo UI)
        |
        v
AI Monitoring Agent (Tambo SDK)
        |
        v
Mock / Metrics Source (Service Health Data)
        |
        v
Analytics Engine (Risk Scoring + Ranking)

--------------------------------------------------------------------------------------------------------------------------------------------------------
🛠️ Tech Stack

Next.js (App Router)

TypeScript

Tambo AI SDK

Generative UI Components

Microservice Metrics Simulation

GitHub Actions CI


-----------------------

🚀 Getting Started
1️⃣ Clone Repository
git clone https://github.com/ManjuVasanth/tambo.git
cd ai-microservice-health-monitor

2️⃣ Install Dependencies
npm install --legacy-peer-deps

3️⃣ Run the Development Server
npm run dev


App will run at:

http://localhost:3000

🧪 Example Use Cases

Detect microservice outages faster

Identify risky services before incidents occur

Reduce debugging time with AI explanations

Provide an intelligent alternative to raw dashboards

--------------------------------------
🔮 Future Enhancements

Connect to real Prometheus/Grafana metrics

Add alerting + anomaly detection

Store historical trends in PostgreSQL

Support Kubernetes cluster monitoring



------------------------------------------------------
Project Structure

ai-microservice-health-monitor/
├── app/
│   ├── chat/                # Interactive AI monitoring chat UI
│   ├── dashboard/           # Service health analytics UI
│   └── page.tsx             # Redirect to /chat
│
├── lib/
│   ├── monitoring/          # Risk scoring + service analytics
│   ├── tambo/               # Tambo agent + UI integration
│
├── cli/                     # CLI support for monitoring commands
├── components/              # UI components
├── public/
├── README.md
└── package.json
