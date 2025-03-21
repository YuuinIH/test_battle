<!-- src/views/BattleView.vue -->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useBattleStore } from '@/stores/battle'
import { BattlePhase, BattleStatus, ELEMENT_MAP, type petId, type PetMessage } from '@test-battle/const'
import PetStatus from '@/components/PetStatus.vue'
import BattleLogEntry from '@/components/BattleLogEntry.vue'

const store = useBattleStore()

// 安全访问方法
const safePet = (pet?: PetMessage) => pet ?? ({} as PetMessage)

// 计算属性增强
const currentPhase = computed(() => {
  const phaseMap: Record<string, string> = {
    [BattlePhase.SwitchPhase]: '换宠阶段',
    [BattlePhase.SelectionPhase]: '指令选择',
    [BattlePhase.ExecutionPhase]: '回合执行',
    [BattlePhase.Ended]: '已结束',
  }
  return phaseMap[store.state?.currentPhase ?? ''] || '未知阶段'
})

const battleStatus = computed(() => {
  const statusMap: Record<string, string> = {
    [BattleStatus.Unstarted]: '未开始',
    [BattleStatus.OnBattle]: '进行中',
    [BattleStatus.Ended]: '已结束',
  }
  return statusMap[store.state?.status ?? ''] || '未知状态'
})

const logContainer = ref<HTMLElement | null>(null)

// 自动滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  })
}

watch(
  () => store.log.length,
  () => scrollToBottom(),
  { flush: 'post' }, // 确保在DOM更新后执行
)

const battleResult = computed(() => {
  if (!store.isBattleEnd) return ''
  const winner = store.state?.players.find(p => p.id === store.victor)
  if (!winner) return '平局'
  return winner.id === store.playerId ? '胜利！🎉' : '失败...💔'
})

onMounted(scrollToBottom)
</script>

<template>
  <div class="battle-container">
    <!-- 左侧玩家区域 -->
    <div class="left-side">
      <div class="trainer-info player-info">
        <h2 class="trainer-name">{{ store.currentPlayer?.name || '玩家' }}</h2>
        <div class="rage-display">
          <span class="rage-icon">🔥</span>
          {{ store.currentPlayer?.rage ?? 0 }}/100
        </div>
      </div>
      <PetStatus
        :pet="safePet(store.currentPlayer?.activePet)"
        :is-fainted="(store.currentPlayer?.activePet?.currentHp ?? 0) <= 0"
        class="pet-status-left"
      />
    </div>

    <!-- 中央战斗区域 -->
    <div class="center-area">
      <div class="round-number">{{ store.state?.currentTurn || 0 }}</div>
      <div v-if="store.state?.marks?.length" class="field-effects">
        <div v-for="mark in store.state.marks" :key="mark.id" class="field-effect" :title="`剩余${mark.duration}回合`">
          {{ '⭕' }} {{ mark.name }} ×{{ mark.stack }}
        </div>
      </div>
      <div class="battle-message">
        <p>{{ '战斗开始！' }}</p>
      </div>
    </div>

    <!-- 右侧对手区域 -->
    <div class="right-side">
      <div class="trainer-info opponent-info">
        <h2 class="trainer-name">{{ store.opponent?.name || '对手' }}</h2>
        <div class="rage-display">
          <span class="rage-icon">🔥</span>
          {{ store.opponent?.rage ?? 0 }}/100
        </div>
      </div>
      <PetStatus
        :pet="safePet(store.opponent?.activePet)"
        :is-fainted="(store.opponent?.activePet?.currentHp ?? 0) <= 0"
        class="pet-status-right"
        is-opponent
      />
    </div>

    <div class="bottom-panel">
      <!-- 左侧操作面板 -->
      <div class="action-panel">
        <template v-if="store.availableActions.length">
          <button
            v-for="(action, index) in store.availableActions"
            :key="index"
            class="action-btn"
            :class="[`action-${action.type.replace('_', '-')}`]"
            @click="store.sendplayerSelection(action)"
          >
            <template v-if="action.type === 'use-skill'">
              <span class="action-icon">🎯</span>
              <div class="action-info">
                <div class="action-title">{{ store.getSkillInfo(action.skill).name }}</div>
                <div class="action-cost">消耗 {{ store.getSkillInfo(action.skill).cost }} 怒气</div>
              </div>
            </template>

            <template v-else-if="action.type === 'switch-pet'">
              <span class="action-icon">🔄</span>
              <div class="action-info">
                <div class="action-title">
                  {{ store.getPetById(action.pet as petId)?.name || '未知精灵' }}
                </div>
                <div class="action-sub">
                  HP: {{ store.getPetById(action.pet as petId)?.currentHp ?? '?' }}/{{
                    store.getPetById(action.pet as petId)?.maxHp ?? '?'
                  }}
                </div>
              </div>
            </template>

            <template v-else-if="action.type === 'do-nothing'">
              <span class="action-icon">🔄</span>
              <div class="action-info">
                <div class="action-title">什么都不做</div>
              </div>
            </template>

            <template v-else-if="action.type === 'surrender'">
              <span class="action-icon">🏳️</span>
              <div class="action-info">
                <div class="action-title">投降</div>
              </div>
            </template>
          </button>
        </template>
        <div v-else class="action-placeholder">
          <el-icon><Clock /></el-icon>
          <span>等待对手操作...</span>
        </div>
      </div>

      <!-- 右侧日志面板 -->
      <div class="log-panel">
        <div class="log-header">
          <el-icon><Notebook /></el-icon>
          <span>战斗日志</span>
        </div>
        <div class="log-scroll-container" ref="logContainer">
          <TransitionGroup name="log-transition">
            <BattleLogEntry v-for="message in store.log" :key="message.sequenceId" :message="message" />
          </TransitionGroup>
        </div>
      </div>
    </div>

    <Transition name="fade">
      <div v-if="store.isBattleEnd" class="battle-end-overlay">
        <div class="result-box">
          <h2 class="result-title">{{ battleResult }}</h2>

          <div class="result-actions">
            <button
              class="action-btn"
              @click="
                $router.push({
                  name: 'Lobby',
                  query: { startMatching: 'true' },
                })
              "
            >
              重新匹配
            </button>
            <button class="action-btn" @click="$router.push('/')">返回大厅</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.battle-container {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  grid-template-rows: auto 1fr auto;
  height: 100vh;
  background: #1a1a2e;
  color: #fff;
  padding: 0;
  gap: 0;
}

.left-side,
.right-side {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding: 10px;
  width: 100%;
}

.center-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: url('path-to-grassy-background.jpg') no-repeat center center;
  background-size: cover;
  position: relative;
}

.trainer-info {
  background: rgba(0, 0, 0, 0.5);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
  width: 100%;
}

.trainer-name {
  color: #81c784;
  font-size: 1.2rem;
  margin: 0;
}

.rage-display {
  font-size: 1rem;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 5px;
}

.pet-status-left,
.pet-status-right {
  width: 100%;
  margin: 0;
  transform: none; /* Remove flip for alignment */
}

.pet-status-left {
  margin-left: 20px;
}

.pet-status-right {
  margin-right: 20px;
}

.round-number {
  font-size: 4rem;
  font-weight: bold;
  color: #fff;
  margin: 20px 0;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.battle-message {
  background: rgba(0, 0, 0, 0.7);
  border-radius: 8px;
  padding: 10px;
  color: #fff;
  font-size: 1rem;
  max-width: 300px;
  text-align: center;
}

.bottom-panel {
  grid-row: 3;
  grid-column: 1 / 4;
  display: grid;
  grid-template-columns: 2fr 1fr; /* 左右等宽分栏 */
  gap: 16px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.9);
  border-top: 2px solid #2c2c4d;
  height: 35vh; /* 增加可视区域 */
  min-height: 240px; /* 添加最小高度限制 */
}

.action-panel {
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  border-right: none;
  box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.2);
}

.log-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.log-scroll-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 20px 20px;
  /* 调整遮罩范围避免覆盖滚动条 */
  mask-image: linear-gradient(to top, transparent 0, black 24px, black calc(100% - 24px), transparent);
  /* 增加右边距防止滚动条遮挡内容 */
  padding-right: 30px;
  margin-right: -10px;
  scroll-behavior: smooth;
  overflow-anchor: auto; /* 启用滚动锚定 */
}

/* 优化滚动条位置 */
.log-scroll-container::-webkit-scrollbar {
  width: 8px;
}

.log-scroll-container::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
}

.log-scroll-container::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 180, 0.8);
  border-radius: 4px;
}

.action-btn {
  border-radius: 8px;
  margin-bottom: 8px;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  backdrop-filter: blur(4px);
}

.action-btn:hover {
  transform: translateX(6px);
  box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.3);
}

/* 新增按钮颜色区分 */
.action-use-skill {
  background: linear-gradient(45deg, rgba(76, 175, 80, 0.15) 0%, rgba(76, 175, 80, 0.3) 100%);
  border-left: 4px solid #4caf50;
}

.action-switch-pet {
  background: linear-gradient(45deg, rgba(33, 150, 243, 0.15) 0%, rgba(33, 150, 243, 0.3) 100%);
  border-left: 4px solid #2196f3;
}

.action-surrender {
  background: linear-gradient(45deg, rgba(244, 67, 54, 0.15) 0%, rgba(244, 67, 54, 0.3) 100%);
  border-left: 4px solid #f44336;
}

.action-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #666;
  height: 100%;
}

.battle-end-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.result-box {
  background: linear-gradient(145deg, #2a2a4a, #1a1a2e);
  padding: 2rem 4rem;
  border-radius: 16px;
  text-align: center;
  box-shadow: 0 0 30px rgba(81, 65, 173, 0.4);
}

.result-title {
  font-size: 3rem;
  margin: 1rem 0;
  text-shadow: 0 0 20px #fff;
}

.result-actions {
  margin-top: 2rem;
  display: flex;
  gap: 1rem;
  justify-content: center;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.battle-result {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  font-size: 3rem;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  animation: float 2s ease-in-out infinite;
}

@keyframes float {
  0%,
  100% {
    transform: translateY(-50%) translateY(0);
  }
  50% {
    transform: translateY(-50%) translateY(-20px);
  }
}
</style>
