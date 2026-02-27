import type { Ref } from 'vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'

interface UseStickyHeaderOptions {
  /** 触发吸顶的偏移量（默认 44px = h-11） */
  offset?: number
  /** 根元素，默认 null 表示视口 */
  root?: HTMLElement | null
}

export function useStickyHeader(
  sentinelRef: Ref<HTMLElement | null>,
  options: UseStickyHeaderOptions = {},
) {
  const isSticky = ref(false)
  const { offset = 44, root = null } = options

  let observer: IntersectionObserver | null = null

  onMounted(() => {
    if (!sentinelRef.value)
      return

    // 创建 Intersection Observer
    // rootMargin: "-44px 0px 0px 0px" 表示顶部留出 44px 偏移量
    observer = new IntersectionObserver(
      ([entry]) => {
        // entry.isIntersecting = false 表示 sentinel 离开视口顶部区域
        // 即菜单栏应该吸顶
        isSticky.value = !entry.isIntersecting
      },
      {
        root,
        rootMargin: `-${offset}px 0px 0px 0px`,
        threshold: 0,
      },
    )

    observer.observe(sentinelRef.value)
  })

  onBeforeUnmount(() => {
    if (observer && sentinelRef.value) {
      observer.unobserve(sentinelRef.value)
      observer.disconnect()
    }
  })

  return {
    isSticky,
  }
}
