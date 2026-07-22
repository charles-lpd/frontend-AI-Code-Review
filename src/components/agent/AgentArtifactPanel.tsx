import { memo } from 'react';
import type { AgentArtifactPanelProps } from '../../types/agent';
import { AgentArtifactCard } from './AgentArtifactCard';

function AgentArtifactPanelBase({
  artifacts,
  summary,
  finalSummary,
  branchName,
  commitMessage,
  pullRequestUrl,
  generatedDocument,
  generatedFix,
}: AgentArtifactPanelProps & {
  branchName: string | null;
  commitMessage: string | null;
  pullRequestUrl: string | null;
}) {
  return (
    <section className="agent-page__panel">
      <div className="agent-page__panel-toggle" aria-hidden="true">
        <div>
          <div className="agent-page__panel-title-row">
            <h2 className="agent-page__panel-title">产物区</h2>
            <span className="agent-page__panel-badge">{artifacts.length} 项</span>
          </div>
          <p className="agent-page__panel-subtitle">集中展示草稿、摘要、PR 和修复结果。</p>
        </div>
      </div>

      <div className="agent-page__collapse-shell agent-page__collapse-shell--open">
        <div className="agent-page__collapse-body">
          <div className="agent-page__artifact-list">
            <div className="agent-page__artifact-summary">
              <div className="agent-page__artifact-summary-title">当前摘要</div>
              <div className="agent-page__artifact-summary-text">
                {finalSummary || summary || '等待最终结果。'}
              </div>
            </div>

            <div className="agent-page__artifact-summary">
              <div className="agent-page__artifact-summary-title">文档 / 草稿</div>
              <div className="agent-page__artifact-summary-text">
                {generatedDocument || '暂无文档型产物。'}
              </div>
            </div>

            <div className="agent-page__artifact-summary">
              <div className="agent-page__artifact-summary-title">修复结果</div>
              <div className="agent-page__artifact-summary-text">
                {generatedFix || '暂无修复产物。'}
              </div>
            </div>

            <div className="agent-page__artifact-summary">
              <div className="agent-page__artifact-summary-title">分支与提交</div>
              <div className="agent-page__artifact-summary-text">
                <div>分支: {branchName || '未生成'}</div>
                <div>提交: {commitMessage || '未生成'}</div>
                <div>PR: {pullRequestUrl || '未生成'}</div>
              </div>
            </div>

            <div className="agent-page__artifact-items">
              {artifacts.length > 0 ? (
                artifacts.map((artifact) => (
                  <AgentArtifactCard
                    key={artifact.artifactKey}
                    title={artifact.artifactType || '产物'}
                    content={artifact.text}
                    data={artifact.data}
                    url={artifact.url}
                    filePath={artifact.filePath}
                  />
                ))
              ) : (
                <div className="agent-page__empty-note">产物会在执行过程中逐步出现。</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export const AgentArtifactPanel = memo(AgentArtifactPanelBase);
