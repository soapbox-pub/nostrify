<script setup>
import DefaultTheme from 'vitepress/theme'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #layout-bottom>
      <div class="nostrify-layout-bottom">
        <a href="https://soapbox.pub" target="_blank">
          <img src="/soapbox.svg" alt="Soapbox" />
        </a>
      </div>
    </template>
  </Layout>
</template>