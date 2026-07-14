import sys
import re

file_path = "app/circle/workspace.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

pattern = re.compile(r"(  const isViewerRecipient = viewerMember && recipient && viewerMember\.id === recipient\.id;\n\n)(  return \(\n    <View style=\{styles\.section\}>.*?\n  \);\n})(\n\nfunction PeopleTab\(\{)", re.DOTALL)

match = pattern.search(content)
if not match:
    print("Error: Could not find the RoundTab block to replace.")
    sys.exit(1)

new_return_block = """  const sortedRoundMembers = useMemo(() => {
    return [...currentRoundMembers].sort((a, b) => {
      const statusPriority = (raw: string) => {
        if (raw === 'confirmed') return 3;
        if (raw === 'submitted') return 2;
        return 1;
      };
      const prioA = statusPriority(a.status.raw);
      const prioB = statusPriority(b.status.raw);
      if (prioA !== prioB) return prioB - prioA;
      const timeA = new Date(a.contribution?.confirmedAt || a.contribution?.submittedAt || a.contribution?.updatedAt || 0).getTime();
      const timeB = new Date(b.contribution?.confirmedAt || b.contribution?.submittedAt || b.contribution?.updatedAt || 0).getTime();
      return timeB - timeA;
    });
  }, [currentRoundMembers]);

  const renderMemberRow = ({ member, status, contribution }: { member: BackendCircleMember, status: any, contribution: any }, isLast: boolean, showArrow: boolean) => {
    const isProcessing = processingMemberId === member.id;
    const canMarkPaid = canReviewContributions && ['due', 'missed', 'rejected'].includes(status.raw);
    const canApprove = canReviewContributions && ['submitted', 'late'].includes(status.raw);
    const canReject = canApprove;
    
    const dateStr = contribution?.confirmedAt || contribution?.submittedAt;
    const timeStr = dateStr ? new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

    return (
      <View key={member.id} style={[{ flexDirection: 'column', paddingHorizontal: 16, paddingVertical: 12 }, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.cardBorder }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Image source={{ uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(memberName(member))}&background=random` }} style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textStrong }}>
              {canApprove ? `${memberName(member)} says they sent ${formatMoney(circle.contributionAmount)}` : memberName(member)}
            </Text>
            {timeStr ? <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>{timeStr}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textStrong }}>{formatMoney(circle.contributionAmount)}</Text>
          </View>
          <StatusBadge label={status.label === 'Overdue' || status.label === 'Due' ? 'Pending' : status.label} tone={statusTone(status.raw)} />
          {showArrow ? (
            <FontAwesome name="angle-right" size={16} color={colors.muted} style={{ marginLeft: 8 }} />
          ) : null}
        </View>

        {(canMarkPaid || canApprove) ? (
          <View style={[styles.actionButtons, { marginTop: 12, marginLeft: 52 }]}>
            {canMarkPaid ? (
              <Pressable
                style={styles.confirmButton}
                disabled={isProcessing}
                onPress={() => onMarkPaid(member)}
                accessibilityRole="button"
                accessibilityLabel={`Mark ${memberName(member)} paid`}
              >
                <Text style={styles.confirmText}>Mark Paid</Text>
              </Pressable>
            ) : null}
            {canRemindMembers && canMarkPaid ? (
              <Pressable
                style={styles.secondaryButton}
                disabled={isProcessing}
                onPress={() => onRemind(member)}
                accessibilityRole="button"
                accessibilityLabel={`Remind ${memberName(member)}`}
              >
                <Text style={styles.secondaryButtonText}>Remind</Text>
              </Pressable>
            ) : null}
            {canApprove ? (
              <Pressable
                style={styles.confirmButton}
                disabled={isProcessing}
                onPress={() => onApprove(member)}
                accessibilityRole="button"
                accessibilityLabel={`Confirm receipt from ${memberName(member)}`}
              >
                <Text style={styles.confirmText}>Confirm Receipt</Text>
              </Pressable>
            ) : null}
            {canReject ? (
              <Pressable
                style={styles.rejectButton}
                disabled={isProcessing}
                onPress={() => onReject(member)}
                accessibilityRole="button"
                accessibilityLabel={`Reject ${memberName(member)} contribution`}
              >
                <Text style={styles.rejectText}>Reject</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.section}>
      {isViewerRecipient ? (
        <View style={[styles.sectionCard, { marginTop: 0, marginBottom: 16, borderColor: colors.success, backgroundColor: `${colors.success}10` }]}>
          <Text style={[styles.sectionTitle, { color: colors.success }]}>
            🎉 You receive the payout this round
          </Text>
          <Text style={styles.sectionSubtitle}>
            When all contributions are confirmed, the organizer can release the payout to you.
          </Text>
        </View>
      ) : recipient ? (
        <View style={[styles.sectionCard, { marginTop: 0, marginBottom: 16, borderColor: '#6366f1', backgroundColor: '#6366f110' }]}>
          <Text style={[styles.sectionTitle, { color: '#6366f1' }]}>
            🎁 {memberName(recipient)} receives the payout
          </Text>
          <Text style={styles.sectionSubtitle}>
            {memberName(recipient)} will receive {formatOptionalMoney(payoutAmount)} once all contributions are collected.
          </Text>
        </View>
      ) : null}

      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={styles.heroRoundBadge}>
            <Text style={styles.heroRoundText}>{currentRoundNumber}</Text>
          </View>
          <View style={styles.heroHeaderCopy}>
            <Text style={styles.heroEyebrow}>Round {currentRoundNumber} of {visibleTotalRounds}</Text>
            <Text style={styles.heroTitle}>
              {capitalizeFrequency(circle.frequency)} cycle
            </Text>
          </View>
        </View>

        <View style={styles.heroGrid}>
          <InfoRow 
            label="Payout this round" 
            value={recipient ? `${memberName(recipient)} receives ${formatOptionalMoney(payoutAmount)}` : 'Unassigned'} 
          />
          <InfoRow
            label="Confirmed"
            value={formatConfirmedStatusFromCounts(
              visibleConfirmedCount,
              expectedContributionsCount,
            )}
          />
          <InfoRow label="Progress" value={formatProgress(visibleProgress)} last />
        </View>
        <View style={{ height: 8, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 4, marginTop: 16, overflow: 'hidden', flexDirection: 'row' }}>
          <View style={{ height: '100%', backgroundColor: '#10B981', borderRadius: 4, width: typeof visibleProgress === 'number' ? `${Math.max(0, Math.min(100, visibleProgress))}%` : '0%' }} />
        </View>

        <View style={styles.heroFooter}>
          <StatusBadge
            label={payoutReleased ? 'Payout released' : displayPayoutReady ? 'Ready for payout' : 'In progress'}
            tone={payoutReleased ? 'success' : displayPayoutReady ? 'ready' : 'muted'}
          />
          <StatusBadge
            label={displayRoundStatus}
            tone="soft"
          />
        </View>
      </View>

      {/* Who Has Paid Card */}
      <View style={[styles.sectionCard, { paddingHorizontal: 0 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 }}>
          <Text style={styles.sectionTitle}>Who has paid</Text>
          {sortedRoundMembers.length > 5 && (
            <Pressable onPress={() => setShowFullWhoHasPaid(true)}>
              <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>View all</Text>
            </Pressable>
          )}
        </View>
        <View>
          {sortedRoundMembers.slice(0, 5).map((item, index, arr) => {
            const isLast = index === arr.length - 1;
            const showArrow = sortedRoundMembers.length <= 5;
            return renderMemberRow(item, isLast, showArrow);
          })}
        </View>
        {sortedRoundMembers.length > 5 && (
          <Pressable onPress={() => setShowFullWhoHasPaid(true)} style={{ marginTop: 12, alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.cardBorder }}>
            <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 15 }}>View all {sortedRoundMembers.length} members</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Round details</Text>
        <Text style={styles.sectionSubtitle}>
          Live backend status for the current round
        </Text>
        <DetailRow label="Contribution" value={formatMoney(circle.contributionAmount)} />
        <DetailRow label="Due date" value={formatDate(dueDate)} />
        <DetailRow
          label="Expected contributions"
          value={typeof totalMembers === 'number' ? `${totalMembers} expected` : 'Unavailable'}
        />
        <DetailRow
          label="Payout readiness"
          value={payoutReleased ? 'Released' : displayPayoutReady ? 'Ready' : 'Not ready'}
          last
        />
      </View>

      {!canReviewContributions ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>My Next Action</Text>
          <Text style={styles.sectionSubtitle}>
            {viewerMember 
              ? `Your ${formatMoney(circle.contributionAmount)} contribution is due.` 
              : 'Membership unavailable.'}
          </Text>
          
          {viewerMember && memberCanSubmitContribution ? (
            <View style={styles.paymentInstructions}>
              <FontAwesome name="send" size={14} color={colors.primary} style={{ marginBottom: 6 }} />
              <Text style={styles.paymentInstructionsTitle}>Where to send your payment</Text>
              <Text style={styles.paymentInstructionsText}>
                {paymentInstructions ?? 'Contact the organizer for payment details.'}
              </Text>
            </View>
          ) : null}

          {/* Post-submit pending state */}
          {viewerMember && viewerContributionStatus.raw === 'submitted' ? (
            <View style={styles.pendingConfirmationCard}>
              <FontAwesome name="clock-o" size={20} color={colors.warning} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.pendingConfirmationTitle}>Payment reported!</Text>
                <Text style={styles.pendingConfirmationText}>
                  Waiting for the organizer to confirm receipt. You're all set for now.
                </Text>
              </View>
            </View>
          ) : viewerMember ? (
            memberCanSubmitContribution ? (
              <Pressable
                style={styles.primaryButton}
                onPress={() => router.push(contributionHref(circle.id))}
                accessibilityRole="button"
                accessibilityLabel="I Sent It"
              >
                <Text style={styles.primaryButtonText}>I Sent It ✓</Text>
              </Pressable>
            ) : (
              <StatusBadge
                label={viewerContributionStatus.label}
                tone={statusTone(viewerContributionStatus.raw)}
              />
            )
          ) : (
            <StatusBadge label="None" tone="muted" />
          )}
        </View>
      ) : null}

      {/* Release Payout is gated on backend permission only — display state
          (displayPayoutReady / displayAllConfirmed) must never unlock this. */}
      {canReleasePayout && isPremium ? (
        <Pressable
          style={styles.payoutButton}
          onPress={() => onReleasePayout(false)}
          accessibilityRole="button"
          accessibilityLabel="Release payout"
        >
          <FontAwesome name="money" size={18} color="#fff" />
          <Text style={styles.payoutButtonText}>Release Payout</Text>
        </Pressable>
      ) : canReleasePayout && !isPremium ? (
        <View style={{ width: '100%' }}>
          <Pressable
            style={[styles.payoutButton, { backgroundColor: '#6366f1' }]}
            onPress={() => router.push('/subscription')}
            accessibilityRole="button"
            accessibilityLabel="Upgrade to Premium"
          >
            <FontAwesome name="star" size={18} color="#fff" />
            <Text style={styles.payoutButtonText}>Premium: 1-Tap Payout</Text>
          </Pressable>
          <Pressable
            style={{ marginTop: 16, paddingVertical: 12, alignItems: 'center' }}
            onPress={() => onReleasePayout(true)}
            accessibilityRole="button"
            accessibilityLabel="Mark Paid Manually"
          >
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Mark as Paid Manually</Text>
          </Pressable>
        </View>
      ) : displayPayoutReady && !payoutReleased ? (
        <Text style={[styles.helperText, { marginTop: 8, textAlign: 'center' }]}>
          The round appears fully confirmed. Waiting for backend payout permission.
        </Text>
      ) : null}

      <Modal visible={showFullWhoHasPaid} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowFullWhoHasPaid(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.cardBorder, backgroundColor: '#fff' }}>
            <Pressable onPress={() => setShowFullWhoHasPaid(false)} style={{ padding: 8, marginRight: 16 }} accessibilityRole="button">
              <FontAwesome name="arrow-left" size={20} color={colors.textStrong} />
            </Pressable>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textStrong }}>Who has paid this round</Text>
          </View>
          <ScrollView style={{ flex: 1 }}>
            <View style={{ padding: 0, backgroundColor: '#fff', minHeight: '100%' }}>
              {sortedRoundMembers.map((item, index, arr) => {
                const isLast = index === arr.length - 1;
                return renderMemberRow(item, isLast, false);
              })}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}"""

new_content = content[:match.start(2)] + new_return_block + content[match.end(2):]

with open(file_path, "w", encoding="utf-8") as f:
    f.write(new_content)

print("UI successfully merged!")
