import 'dart:async';

import 'package:flutter/material.dart';

import '../../../config/env.dart';
import '../../../core/network/api_client.dart';
import '../../auth/models/session_user.dart';
import '../data/workspace_repository.dart';
import '../data/workspace_realtime_client.dart';
import '../models/dashboard.dart';

class DashboardPage extends StatefulWidget {
  const DashboardPage({
    super.key,
    required this.sessionUser,
    required this.accessToken,
    required this.workspaceRepository,
    required this.onLogout,
  });

  final SessionUser sessionUser;
  final String accessToken;
  final WorkspaceRepository workspaceRepository;
  final Future<void> Function() onLogout;

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  bool _isLoading = true;
  bool _isRefreshing = false;
  bool _isEndingSession = false;
  bool _showUpcomingAgenda = false;
  String? _errorMessage;
  ProfessionalDashboard? _dashboard;
  final Set<String> _busyAppointmentIds = <String>{};
  final Set<String> _expandedUpcomingIds = <String>{};
  final WorkspaceRealtimeClient _realtimeClient = WorkspaceRealtimeClient(
    baseUrl: Env.realtimeBaseUrl,
  );
  StreamSubscription<WorkspaceRealtimeEvent>? _realtimeSubscription;
  Timer? _realtimeRefreshDebounce;

  @override
  void initState() {
    super.initState();
    _connectRealtime();
    _loadDashboard();
  }

  @override
  void dispose() {
    _realtimeRefreshDebounce?.cancel();
    _realtimeSubscription?.cancel();
    _realtimeClient.close();
    super.dispose();
  }

  String _resolveErrorMessage(Object error) {
    if (error is ApiException) {
      if (error.statusCode == 401) {
        return 'Sua sessao expirou. Entre novamente para continuar.';
      }

      if (error.message.contains(
        'status must be one of the following values',
      )) {
        return 'A acao deste atendimento ficou desatualizada. Atualize o workspace e tente novamente.';
      }

      return error.message;
    }

    return 'Nao foi possivel atualizar o workspace.';
  }

  bool _isAppointmentBusy(String appointmentId) {
    return _busyAppointmentIds.contains(appointmentId);
  }

  void _setAppointmentBusy(String appointmentId, bool isBusy) {
    if (!mounted) {
      return;
    }

    setState(() {
      if (isBusy) {
        _busyAppointmentIds.add(appointmentId);
      } else {
        _busyAppointmentIds.remove(appointmentId);
      }
    });
  }

  void _showFeedback(String message) {
    if (!mounted) {
      return;
    }

    final messenger = ScaffoldMessenger.of(context);
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  void _toggleUpcomingAgendaVisibility() {
    if (!mounted) {
      return;
    }

    setState(() {
      _showUpcomingAgenda = !_showUpcomingAgenda;
      if (!_showUpcomingAgenda) {
        _expandedUpcomingIds.clear();
      }
    });
  }

  void _toggleUpcomingAppointmentDetails(String appointmentId) {
    if (!mounted) {
      return;
    }

    setState(() {
      if (_expandedUpcomingIds.contains(appointmentId)) {
        _expandedUpcomingIds.remove(appointmentId);
      } else {
        _expandedUpcomingIds
          ..clear()
          ..add(appointmentId);
      }
    });
  }

  void _connectRealtime() {
    final tenantId = widget.sessionUser.activeTenantId;
    final professionalId = widget.sessionUser.linkedProfessionalId;

    if (tenantId == null ||
        tenantId.trim().isEmpty ||
        professionalId == null ||
        professionalId.trim().isEmpty) {
      return;
    }

    _realtimeSubscription?.cancel();
    _realtimeSubscription = _realtimeClient.events.listen((_) {
      if (!mounted) {
        return;
      }

      _realtimeRefreshDebounce?.cancel();
      _realtimeRefreshDebounce = Timer(
        const Duration(milliseconds: 450),
        () {
          if (mounted) {
            _loadDashboard(isRefresh: true);
          }
        },
      );
    });

    _realtimeClient.connect(
      accessToken: widget.accessToken,
      tenantId: tenantId,
      professionalId: professionalId,
    );
  }

  Future<bool> _handleUnauthorized(Object error) async {
    if (error is! ApiException ||
        error.statusCode != 401 ||
        _isEndingSession ||
        !mounted) {
      return false;
    }

    _isEndingSession = true;

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('Sessao expirada'),
          content: const Text(
            'Seu acesso expirou neste dispositivo. Faca login novamente para continuar.',
          ),
          actions: <Widget>[
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Voltar ao login'),
            ),
          ],
        );
      },
    );

    if (mounted) {
      await widget.onLogout();
    }

    return true;
  }

  Future<void> _loadDashboard({bool isRefresh = false}) async {
    setState(() {
      if (_dashboard == null) {
        _isLoading = true;
      } else {
        _isRefreshing = isRefresh;
      }
      _errorMessage = null;
    });

    try {
      final dashboard = await widget.workspaceRepository.loadDashboard(
        widget.accessToken,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _dashboard = dashboard;
      });
    } catch (error) {
      if (await _handleUnauthorized(error) || !mounted) {
        return;
      }

      setState(() {
        _errorMessage = _resolveErrorMessage(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _isRefreshing = false;
        });
      }
    }
  }

  Future<void> _updateStatus(
    ProfessionalAgendaItem item,
    String status,
  ) async {
    _setAppointmentBusy(item.id, true);

    setState(() {
      _errorMessage = null;
    });

    try {
      final dashboard =
          await widget.workspaceRepository.updateAppointmentStatus(
        accessToken: widget.accessToken,
        appointmentId: item.id,
        status: status,
        reason: 'Atualizado pelo app profissional',
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _dashboard = dashboard;
      });

      _showFeedback(
        switch (status) {
          'CALLED' => 'Paciente chamado para a sala.',
          'IN_PROGRESS' => 'Atendimento iniciado.',
          'AWAITING_CLOSURE' => 'Atendimento enviado para fechamento.',
          'AWAITING_PAYMENT' => 'Paciente devolvido para recepcao e pagamento.',
          _ => 'Atendimento marcado como no-show.',
        },
      );
    } catch (error) {
      if (await _handleUnauthorized(error) || !mounted) {
        return;
      }

      setState(() {
        _errorMessage = _resolveErrorMessage(error);
      });
    } finally {
      _setAppointmentBusy(item.id, false);
    }
  }

  Future<void> _editNotes(ProfessionalAgendaItem item) async {
    final newNotes = await _showNotesEditor(item);
    if (newNotes == null) {
      return;
    }

    _setAppointmentBusy(item.id, true);

    setState(() {
      _errorMessage = null;
    });

    try {
      final dashboard = await widget.workspaceRepository.updateAppointmentNotes(
        accessToken: widget.accessToken,
        appointmentId: item.id,
        notes: newNotes,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _dashboard = dashboard;
      });

      _showFeedback('Observacoes atualizadas.');
    } catch (error) {
      if (await _handleUnauthorized(error) || !mounted) {
        return;
      }

      setState(() {
        _errorMessage = _resolveErrorMessage(error);
      });
    } finally {
      _setAppointmentBusy(item.id, false);
    }
  }

  Future<String?> _showNotesEditor(ProfessionalAgendaItem item) async {
    final controller = TextEditingController(text: item.notes ?? '');

    final newNotes = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (BuildContext context) {
        final bottomInset = MediaQuery.of(context).viewInsets.bottom;

        return Padding(
          padding: EdgeInsets.fromLTRB(20, 8, 20, 20 + bottomInset),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Notas do atendimento',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 8),
                Text(
                  '${item.patientName} - ${_DashboardFormatters.timeRange(item.startsAt, item.endsAt)}',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: controller,
                  autofocus: true,
                  maxLines: 8,
                  textInputAction: TextInputAction.done,
                  decoration: const InputDecoration(
                    labelText: 'Observacoes',
                    hintText:
                        'Registre informacoes operacionais, preparo ou retorno do atendimento.',
                    alignLabelWithHint: true,
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: <Widget>[
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.of(context).pop(),
                        child: const Text('Cancelar'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton(
                        onPressed: () {
                          Navigator.of(context).pop(controller.text.trim());
                        },
                        child: const Text('Salvar'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );

    controller.dispose();

    if (newNotes == null) {
      return null;
    }

    if (newNotes == (item.notes ?? '')) {
      return null;
    }

    return newNotes;
  }

  Future<void> _openPatientSummary(ProfessionalAgendaItem item) async {
    _setAppointmentBusy(item.id, true);

    try {
      final summary = await widget.workspaceRepository.loadPatientSummary(
        accessToken: widget.accessToken,
        patientId: item.patientId,
      );

      if (!mounted) {
        return;
      }

      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        builder: (BuildContext context) {
          return FractionallySizedBox(
            heightFactor: 0.92,
            child: _PatientSummarySheet(
              summary: summary,
              currentAgendaItem: item,
            ),
          );
        },
      );
    } catch (error) {
      if (await _handleUnauthorized(error)) {
        return;
      }

      _showFeedback(_resolveErrorMessage(error));
    } finally {
      _setAppointmentBusy(item.id, false);
    }
  }

  Future<void> _logout() async {
    final shouldLogout = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('Sair do app'),
          content: const Text(
            'Voce encerrara a sessao deste dispositivo.',
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Sair'),
            ),
          ],
        );
      },
    );

    if (shouldLogout == true) {
      await widget.onLogout();
    }
  }

  List<ProfessionalAgendaItem> _sortOperationalAgenda(
    List<ProfessionalAgendaItem> items,
  ) {
    final List<ProfessionalAgendaItem> sorted =
        List<ProfessionalAgendaItem>.from(
      items,
    );
    sorted.sort(_compareOperationalAgendaItems);
    return sorted;
  }

  List<ProfessionalAgendaItem> _sortUpcomingAgenda(
    List<ProfessionalAgendaItem> items,
  ) {
    final List<ProfessionalAgendaItem> sorted =
        List<ProfessionalAgendaItem>.from(
      items,
    );
    sorted.sort((ProfessionalAgendaItem left, ProfessionalAgendaItem right) {
      final int byStart = _safeDate(left.startsAt).compareTo(
        _safeDate(right.startsAt),
      );
      if (byStart != 0) {
        return byStart;
      }

      return _statusWeight(left.status).compareTo(_statusWeight(right.status));
    });
    return sorted;
  }

  int _compareOperationalAgendaItems(
    ProfessionalAgendaItem left,
    ProfessionalAgendaItem right,
  ) {
    final int byStatus = _statusWeight(left.status).compareTo(
      _statusWeight(right.status),
    );
    if (byStatus != 0) {
      return byStatus;
    }

    final DateTime leftReference = _operationalReference(left);
    final DateTime rightReference = _operationalReference(right);
    final bool descending = _statusUsesDescendingTime(left.status);
    final int byTime = descending
        ? rightReference.compareTo(leftReference)
        : leftReference.compareTo(rightReference);
    if (byTime != 0) {
      return byTime;
    }

    return _safeDate(left.startsAt).compareTo(_safeDate(right.startsAt));
  }

  DateTime _operationalReference(ProfessionalAgendaItem item) {
    switch (item.status) {
      case 'IN_PROGRESS':
        return _safeDate(item.startedAt ?? item.checkedInAt ?? item.startsAt);
      case 'AWAITING_CLOSURE':
        return _safeDate(
          item.closureReadyAt ??
              item.startedAt ??
              item.checkedInAt ??
              item.startsAt,
        );
      case 'CALLED':
        return _safeDate(item.calledAt ?? item.checkedInAt ?? item.startsAt);
      case 'CHECKED_IN':
        return _safeDate(item.checkedInAt ?? item.startsAt);
      case 'AWAITING_PAYMENT':
        return _safeDate(
          item.awaitingPaymentAt ??
              item.closureReadyAt ??
              item.startedAt ??
              item.startsAt,
        );
      case 'COMPLETED':
        return _safeDate(
            item.completedAt ?? item.awaitingPaymentAt ?? item.startsAt);
      default:
        return _safeDate(item.startsAt);
    }
  }

  bool _statusUsesDescendingTime(String status) {
    return status == 'AWAITING_PAYMENT' || status == 'COMPLETED';
  }

  int _statusWeight(String status) {
    switch (status) {
      case 'IN_PROGRESS':
        return 0;
      case 'AWAITING_CLOSURE':
        return 1;
      case 'CALLED':
        return 2;
      case 'CHECKED_IN':
        return 3;
      case 'AWAITING_PAYMENT':
        return 4;
      case 'CONFIRMED':
        return 5;
      case 'BOOKED':
      case 'RESCHEDULED':
        return 6;
      case 'COMPLETED':
        return 7;
      case 'NO_SHOW':
        return 8;
      case 'CANCELED':
        return 9;
      default:
        return 10;
    }
  }

  DateTime _safeDate(String value) {
    return DateTime.tryParse(value)?.toLocal() ??
        DateTime.fromMillisecondsSinceEpoch(0);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF081215),
      body: Stack(
        children: <Widget>[
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: <Color>[
                  Color(0xFF061114),
                  Color(0xFF0D2127),
                  Color(0xFFF1F6F5),
                ],
                stops: <double>[0, 0.3, 1],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
            ),
            child: SizedBox.expand(),
          ),
          const Positioned(
            top: -180,
            left: -140,
            child: _BackgroundGlow(
              size: 420,
              color: Color(0x661DD5C3),
            ),
          ),
          const Positioned(
            top: 120,
            right: -120,
            child: _BackgroundGlow(
              size: 320,
              color: Color(0x443AA6FF),
            ),
          ),
          const Positioned(
            bottom: -140,
            left: 180,
            child: _BackgroundGlow(
              size: 360,
              color: Color(0x33FFFFFF),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 14),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1640),
                  child: Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: <Color>[
                          Colors.white.withValues(alpha: 0.12),
                          Colors.white.withValues(alpha: 0.06),
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(38),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.12),
                      ),
                      boxShadow: const <BoxShadow>[
                        BoxShadow(
                          color: Color(0x40000000),
                          blurRadius: 42,
                          offset: Offset(0, 22),
                        ),
                      ],
                    ),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
                      child: _buildBody(context),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (_isLoading && _dashboard == null) {
      return const Center(child: CircularProgressIndicator());
    }

    final dashboard = _dashboard;

    if (dashboard == null) {
      return Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              _InlineMessage(
                message: _errorMessage ?? 'Sem dados do workspace.',
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => _loadDashboard(isRefresh: true),
                child: const Text('Tentar novamente'),
              ),
            ],
          ),
        ),
      );
    }

    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final double contentWidth = constraints.maxWidth;
        final bool useTwoColumns = contentWidth >= 1120;
        final bool useDesktopShell = contentWidth >= 1280;
        final double sectionWidth =
            useTwoColumns ? (contentWidth - 12) / 2 : contentWidth;
        final double metricWidth = contentWidth >= 900 ? 196 : contentWidth;
        final List<ProfessionalAgendaItem> orderedTodayAgenda =
            _sortOperationalAgenda(dashboard.todayAgenda);
        final List<ProfessionalAgendaItem> orderedUpcomingAgenda =
            _sortUpcomingAgenda(dashboard.upcomingAgenda);
        final List<ProfessionalAgendaItem> orderedRecentCompleted =
            _sortOperationalAgenda(dashboard.recentCompleted);

        return RefreshIndicator(
          onRefresh: () => _loadDashboard(isRefresh: true),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: <Widget>[
              _WorkspaceChromeBar(
                clinicName: dashboard.clinicDisplayName ?? 'OperaClinic',
                isRefreshing: _isRefreshing,
                onRefresh: _isLoading || _isRefreshing
                    ? null
                    : () => _loadDashboard(isRefresh: true),
                onLogout: _logout,
              ),
              const SizedBox(height: 16),
              if (useDesktopShell)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    SizedBox(
                      width: 294,
                      child: Column(
                        children: <Widget>[
                          _WorkspaceRailCard(
                            dashboard: dashboard,
                            sessionEmail: widget.sessionUser.email,
                            onRefresh: _isLoading || _isRefreshing
                                ? null
                                : () => _loadDashboard(isRefresh: true),
                            onLogout: _logout,
                          ),
                          if (_errorMessage != null) ...<Widget>[
                            const SizedBox(height: 12),
                            _InlineMessage(message: _errorMessage!),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: _WorkspaceCanvas(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            if (_isRefreshing) ...<Widget>[
                              const LinearProgressIndicator(),
                              const SizedBox(height: 18),
                            ],
                            ..._buildWorkspaceSections(
                              context,
                              dashboard,
                              orderedTodayAgenda: orderedTodayAgenda,
                              orderedUpcomingAgenda: orderedUpcomingAgenda,
                              orderedRecentCompleted: orderedRecentCompleted,
                              sectionWidth: sectionWidth,
                              metricWidth: metricWidth,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                )
              else
                _WorkspaceCanvas(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      _DashboardHeroCard(
                        dashboard: dashboard,
                        sessionEmail: widget.sessionUser.email,
                      ),
                      if (_errorMessage != null) ...<Widget>[
                        const SizedBox(height: 16),
                        _InlineMessage(message: _errorMessage!),
                      ],
                      if (_isRefreshing) ...<Widget>[
                        const SizedBox(height: 12),
                        const LinearProgressIndicator(),
                      ],
                      const SizedBox(height: 20),
                      ..._buildWorkspaceSections(
                        context,
                        dashboard,
                        orderedTodayAgenda: orderedTodayAgenda,
                        orderedUpcomingAgenda: orderedUpcomingAgenda,
                        orderedRecentCompleted: orderedRecentCompleted,
                        sectionWidth: sectionWidth,
                        metricWidth: metricWidth,
                      ),
                    ],
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  List<Widget> _buildWorkspaceSections(
    BuildContext context,
    ProfessionalDashboard dashboard, {
    required List<ProfessionalAgendaItem> orderedTodayAgenda,
    required List<ProfessionalAgendaItem> orderedUpcomingAgenda,
    required List<ProfessionalAgendaItem> orderedRecentCompleted,
    required double sectionWidth,
    required double metricWidth,
  }) {
    return <Widget>[
      _MissionControlCard(dashboard: dashboard),
      const SizedBox(height: 20),
      _PatientJourneyCard(summary: dashboard.summary),
      const SizedBox(height: 20),
      const _SectionHeader(
        eyebrow: 'Acao imediata',
        icon: Icons.flash_on_rounded,
        title: 'Foco do plantao',
        subtitle:
            'Veja quem precisa de acao agora e prepare o proximo atendimento sem trocar de tela.',
      ),
      const SizedBox(height: 12),
      Wrap(
        spacing: 12,
        runSpacing: 12,
        children: <Widget>[
          SizedBox(
            width: sectionWidth,
            child: _FocusCard(
              priorityLabel: 'Agora',
              title: 'Paciente em espera',
              emptyLabel:
                  'Nenhum paciente com check-in aguardando neste momento.',
              item: dashboard.focus.waitingPatient,
              primaryActionLabel: 'Chamar',
              primaryActionIcon: Icons.campaign_outlined,
              secondaryActionLabel: 'Paciente',
              secondaryActionIcon: Icons.person_outline,
              isBusy: dashboard.focus.waitingPatient != null &&
                  _isAppointmentBusy(dashboard.focus.waitingPatient!.id),
              onPrimaryAction: dashboard.focus.waitingPatient == null ||
                      !_DashboardFormatters.canCall(
                        dashboard.focus.waitingPatient!,
                      )
                  ? null
                  : () => _updateStatus(
                        dashboard.focus.waitingPatient!,
                        'CALLED',
                      ),
              onSecondaryAction: dashboard.focus.waitingPatient == null
                  ? null
                  : () => _openPatientSummary(
                        dashboard.focus.waitingPatient!,
                      ),
            ),
          ),
          SizedBox(
            width: sectionWidth,
            child: _FocusCard(
              priorityLabel: 'Em seguida',
              title: 'Chamado para sala',
              emptyLabel:
                  'Nenhum paciente foi chamado para a sala neste momento.',
              item: dashboard.focus.calledPatient,
              primaryActionLabel: 'Iniciar',
              primaryActionIcon: Icons.play_arrow_rounded,
              secondaryActionLabel: 'Paciente',
              secondaryActionIcon: Icons.person_outline,
              isBusy: dashboard.focus.calledPatient != null &&
                  _isAppointmentBusy(dashboard.focus.calledPatient!.id),
              onPrimaryAction: dashboard.focus.calledPatient == null ||
                      !_DashboardFormatters.canStart(
                        dashboard.focus.calledPatient!,
                      )
                  ? null
                  : () => _updateStatus(
                        dashboard.focus.calledPatient!,
                        'IN_PROGRESS',
                      ),
              onSecondaryAction: dashboard.focus.calledPatient == null
                  ? null
                  : () => _openPatientSummary(
                        dashboard.focus.calledPatient!,
                      ),
            ),
          ),
          SizedBox(
            width: sectionWidth,
            child: _FocusCard(
              priorityLabel: 'Ativo',
              title: 'Em atendimento',
              emptyLabel: 'Nenhum atendimento em execucao neste momento.',
              item: dashboard.focus.currentAppointment,
              primaryActionLabel: 'Fechamento',
              primaryActionIcon: Icons.assignment_turned_in_outlined,
              secondaryActionLabel: 'Paciente',
              secondaryActionIcon: Icons.person_outline,
              isBusy: dashboard.focus.currentAppointment != null &&
                  _isAppointmentBusy(dashboard.focus.currentAppointment!.id),
              onPrimaryAction: dashboard.focus.currentAppointment == null ||
                      !_DashboardFormatters.canPrepareClosure(
                        dashboard.focus.currentAppointment!,
                      )
                  ? null
                  : () => _updateStatus(
                        dashboard.focus.currentAppointment!,
                        'AWAITING_CLOSURE',
                      ),
              onSecondaryAction: dashboard.focus.currentAppointment == null
                  ? null
                  : () => _openPatientSummary(
                        dashboard.focus.currentAppointment!,
                      ),
            ),
          ),
          SizedBox(
            width: sectionWidth,
            child: _FocusCard(
              priorityLabel: 'Quase la',
              title: 'Fechamento pendente',
              emptyLabel:
                  'Nenhum atendimento aguardando orientacoes e encerramento.',
              item: dashboard.focus.closingAppointment,
              primaryActionLabel: 'Recepcao',
              primaryActionIcon: Icons.point_of_sale_outlined,
              secondaryActionLabel: 'Paciente',
              secondaryActionIcon: Icons.person_outline,
              isBusy: dashboard.focus.closingAppointment != null &&
                  _isAppointmentBusy(dashboard.focus.closingAppointment!.id),
              onPrimaryAction: dashboard.focus.closingAppointment == null ||
                      !_DashboardFormatters.canComplete(
                        dashboard.focus.closingAppointment!,
                      )
                  ? null
                  : () => _updateStatus(
                        dashboard.focus.closingAppointment!,
                        'AWAITING_PAYMENT',
                      ),
              onSecondaryAction: dashboard.focus.closingAppointment == null
                  ? null
                  : () => _openPatientSummary(
                        dashboard.focus.closingAppointment!,
                      ),
            ),
          ),
          SizedBox(
            width: sectionWidth,
            child: _FocusCard(
              priorityLabel: 'Preparar',
              title: 'Proximo atendimento',
              emptyLabel: 'Sem novos atendimentos ativos na sequencia do dia.',
              item: dashboard.focus.nextAppointment,
              primaryActionLabel: 'Paciente',
              primaryActionIcon: Icons.person_outline,
              secondaryActionLabel: 'Preparar nota',
              secondaryActionIcon: Icons.sticky_note_2_outlined,
              isBusy: dashboard.focus.nextAppointment != null &&
                  _isAppointmentBusy(dashboard.focus.nextAppointment!.id),
              onPrimaryAction: dashboard.focus.nextAppointment == null
                  ? null
                  : () => _openPatientSummary(
                        dashboard.focus.nextAppointment!,
                      ),
              onSecondaryAction: dashboard.focus.nextAppointment == null
                  ? null
                  : () => _editNotes(dashboard.focus.nextAppointment!),
            ),
          ),
        ],
      ),
      const SizedBox(height: 20),
      _ShiftProgressCard(summary: dashboard.summary),
      const SizedBox(height: 20),
      const _SectionHeader(
        eyebrow: 'Leitura rapida',
        icon: Icons.auto_graph_rounded,
        title: 'Pulso do dia',
        subtitle:
            'Use estes indicadores para entender carga, fila e pendencias antes de agir na agenda.',
      ),
      const SizedBox(height: 12),
      Wrap(
        spacing: 12,
        runSpacing: 12,
        children: <Widget>[
          SizedBox(
            width: metricWidth,
            child: _MetricCard(
              title: 'Atendimentos hoje',
              value: dashboard.summary.appointmentsToday,
              icon: Icons.today_outlined,
            ),
          ),
          SizedBox(
            width: metricWidth,
            child: _MetricCard(
              title: 'Restantes',
              value: dashboard.summary.remainingToday,
              icon: Icons.schedule_outlined,
            ),
          ),
          SizedBox(
            width: metricWidth,
            child: _MetricCard(
              title: 'Em espera',
              value: dashboard.summary.checkedInWaiting,
              icon: Icons.people_outline,
            ),
          ),
          SizedBox(
            width: metricWidth,
            child: _MetricCard(
              title: 'Chamados',
              value: dashboard.summary.calledToRoom,
              icon: Icons.campaign_outlined,
            ),
          ),
          SizedBox(
            width: metricWidth,
            child: _MetricCard(
              title: 'Em atendimento',
              value: dashboard.summary.inProgress,
              icon: Icons.play_circle_outline,
            ),
          ),
          SizedBox(
            width: metricWidth,
            child: _MetricCard(
              title: 'Fechamento',
              value: dashboard.summary.awaitingClosure,
              icon: Icons.assignment_turned_in_outlined,
            ),
          ),
          SizedBox(
            width: metricWidth,
            child: _MetricCard(
              title: 'Concluidos',
              value: dashboard.summary.completedToday,
              icon: Icons.check_circle_outline,
            ),
          ),
          SizedBox(
            width: metricWidth,
            child: _MetricCard(
              title: 'Na recepcao',
              value: dashboard.summary.sentToReception,
              icon: Icons.point_of_sale_outlined,
            ),
          ),
          SizedBox(
            width: metricWidth,
            child: _MetricCard(
              title: 'Pendentes',
              value: dashboard.summary.pendingConfirmation,
              icon: Icons.warning_amber_outlined,
            ),
          ),
        ],
      ),
      const SizedBox(height: 20),
      const _SectionHeader(
        eyebrow: 'Ordem inteligente',
        icon: Icons.view_stream_rounded,
        title: 'Fila operacional',
        subtitle:
            'A ordem ja prioriza quem exige acao agora: sala, execucao, fechamento, fila e retornos do dia.',
      ),
      const SizedBox(height: 12),
      if (orderedTodayAgenda.isEmpty)
        const _EmptyStateCard(
          title: 'Sem atendimentos na agenda de hoje',
          description:
              'O workspace continua util para acompanhar proximos retornos e revisar historico recente.',
        )
      else
        ...orderedTodayAgenda.map(
          (ProfessionalAgendaItem item) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _AgendaCard(
              item: item,
              isBusy: _isAppointmentBusy(item.id),
              onViewPatient: () => _openPatientSummary(item),
              onEditNotes: () => _editNotes(item),
              onCall: () => _updateStatus(item, 'CALLED'),
              onStart: () => _updateStatus(item, 'IN_PROGRESS'),
              onPrepareClosure: () => _updateStatus(item, 'AWAITING_CLOSURE'),
              onComplete: () => _updateStatus(item, 'AWAITING_PAYMENT'),
              onNoShow: () => _updateStatus(item, 'NO_SHOW'),
            ),
          ),
        ),
      const SizedBox(height: 20),
      const _SectionHeader(
        eyebrow: 'Historico rapido',
        icon: Icons.checklist_rounded,
        title: 'Ultimos concluidos',
        subtitle:
            'Revise rapidamente o que ja foi encerrado clinicamente e devolvido para recepcao.',
      ),
      const SizedBox(height: 12),
      if (orderedRecentCompleted.isEmpty)
        const _EmptyStateCard(
          title: 'Nenhum atendimento concluido ainda',
          description:
              'Assim que o dia avancar, os ultimos atendimentos finalizados aparecerao aqui.',
        )
      else
        ...orderedRecentCompleted.map(
          (ProfessionalAgendaItem item) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _CompactAgendaCard(
              item: item,
              trailingLabel: 'Notas',
              onPressed: () => _editNotes(item),
            ),
          ),
        ),
      const SizedBox(height: 20),
      _UpcomingAgendaSection(
        items: orderedUpcomingAgenda,
        isExpanded: _showUpcomingAgenda,
        expandedIds: _expandedUpcomingIds,
        onToggleExpanded: _toggleUpcomingAgendaVisibility,
        onToggleItem: _toggleUpcomingAppointmentDetails,
        onOpenPatient: _openPatientSummary,
      ),
    ];
  }
}

class _WorkspaceChromeBar extends StatelessWidget {
  const _WorkspaceChromeBar({
    required this.clinicName,
    required this.isRefreshing,
    required this.onRefresh,
    required this.onLogout,
  });

  final String clinicName;
  final bool isRefreshing;
  final VoidCallback? onRefresh;
  final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final bool compact = constraints.maxWidth < 760;

        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: <Color>[
                Color(0xFF081418),
                Color(0xFF10232A),
                Color(0xFF102F36),
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(26),
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.1),
            ),
            boxShadow: const <BoxShadow>[
              BoxShadow(
                color: Color(0x28000000),
                blurRadius: 26,
                offset: Offset(0, 10),
              ),
            ],
          ),
          child: Row(
            children: <Widget>[
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
                child: const Row(
                  children: <Widget>[
                    _WindowDot(color: Color(0xFFFF6B6B)),
                    SizedBox(width: 6),
                    _WindowDot(color: Color(0xFFFFC857)),
                    SizedBox(width: 6),
                    _WindowDot(color: Color(0xFF57CC99)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                width: 42,
                height: 42,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Image.asset(
                  'assets/brand/opera-clinica-icon.png',
                  fit: BoxFit.contain,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        const _LivePulseDot(),
                        const SizedBox(width: 8),
                        Text(
                          'Workspace ao vivo',
                          style:
                              Theme.of(context).textTheme.labelMedium?.copyWith(
                                    color: const Color(0xFF9DEBE2),
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 0.2,
                                  ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      compact ? 'OperaClinic' : 'OperaClinic Professional',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      clinicName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Colors.white.withValues(alpha: 0.62),
                          ),
                    ),
                  ],
                ),
              ),
              if (!compact) ...<Widget>[
                const _TopBarPill(
                  icon: Icons.queue_outlined,
                  label: 'Fila',
                  active: true,
                ),
                const SizedBox(width: 8),
                const _TopBarPill(
                  icon: Icons.today_outlined,
                  label: 'Hoje',
                ),
                const SizedBox(width: 8),
                const _TopBarPill(
                  icon: Icons.receipt_long_outlined,
                  label: 'Recepcao',
                ),
                const SizedBox(width: 12),
              ],
              IconButton(
                tooltip: 'Atualizar',
                onPressed: onRefresh,
                color: Colors.white,
                icon: isRefreshing
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.refresh),
              ),
              IconButton(
                tooltip: 'Sair',
                onPressed: onLogout,
                color: Colors.white,
                icon: const Icon(Icons.logout),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _TopBarPill extends StatelessWidget {
  const _TopBarPill({
    required this.icon,
    required this.label,
    this.active = false,
  });

  final IconData icon;
  final String label;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        gradient: active
            ? const LinearGradient(
                colors: <Color>[
                  Color(0xFF16B6AA),
                  Color(0xFF0D8D89),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              )
            : null,
        color: active ? null : Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: active
              ? Colors.transparent
              : Colors.white.withValues(alpha: 0.08),
        ),
        boxShadow: active
            ? const <BoxShadow>[
                BoxShadow(
                  color: Color(0x3316B6AA),
                  blurRadius: 18,
                  offset: Offset(0, 6),
                ),
              ]
            : null,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(
            icon,
            size: 16,
            color: active ? Colors.white : Colors.white.withValues(alpha: 0.72),
          ),
          const SizedBox(width: 8),
          Text(
            label,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: active
                      ? Colors.white
                      : Colors.white.withValues(alpha: 0.78),
                ),
          ),
        ],
      ),
    );
  }
}

class _WindowDot extends StatelessWidget {
  const _WindowDot({
    required this.color,
  });

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 10,
      height: 10,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
      ),
    );
  }
}

class _BackgroundGlow extends StatelessWidget {
  const _BackgroundGlow({
    required this.size,
    required this.color,
  });

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: color,
            blurRadius: size * 0.36,
            spreadRadius: size * 0.04,
          ),
        ],
      ),
    );
  }
}

class _LivePulseDot extends StatelessWidget {
  const _LivePulseDot();

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0.72, end: 1),
      duration: const Duration(milliseconds: 1400),
      curve: Curves.easeInOut,
      builder: (BuildContext context, double value, Widget? child) {
        return Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: const Color(0xFF7AF2E3),
            shape: BoxShape.circle,
            boxShadow: <BoxShadow>[
              BoxShadow(
                color: const Color(0xFF7AF2E3).withValues(
                  alpha: (0.18 + (value * 0.34)).clamp(0, 1).toDouble(),
                ),
                blurRadius: 10 + (value * 12),
                spreadRadius: 1 + (value * 3),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _WorkspaceCanvas extends StatelessWidget {
  const _WorkspaceCanvas({
    required this.child,
  });

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final ColorScheme colorScheme = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: <Color>[
            Color(0xFFF9FCFC),
            Color(0xFFF2F7F6),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(34),
        border: Border.all(
          color: colorScheme.outline.withValues(alpha: 0.08),
        ),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x14000000),
            blurRadius: 24,
            offset: Offset(0, 10),
          ),
          BoxShadow(
            color: Color(0x14FFFFFF),
            blurRadius: 12,
            offset: Offset(-4, -4),
          ),
        ],
      ),
      child: child,
    );
  }
}

class _RailNavGroup extends StatelessWidget {
  const _RailNavGroup();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: <Widget>[
        _RailNavItem(
          icon: Icons.queue_outlined,
          label: 'Fila operacional',
          active: true,
        ),
        SizedBox(height: 8),
        _RailNavItem(
          icon: Icons.play_circle_outline,
          label: 'Atendimento',
        ),
        SizedBox(height: 8),
        _RailNavItem(
          icon: Icons.point_of_sale_outlined,
          label: 'Recepcao',
        ),
      ],
    );
  }
}

class _RailNavItem extends StatelessWidget {
  const _RailNavItem({
    required this.icon,
    required this.label,
    this.active = false,
  });

  final IconData icon;
  final String label;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        gradient: active
            ? const LinearGradient(
                colors: <Color>[
                  Color(0x33AFFFF8),
                  Color(0x1AD7FFF8),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              )
            : null,
        color: active ? null : Colors.white.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: active
              ? Colors.white.withValues(alpha: 0.12)
              : Colors.transparent,
        ),
        boxShadow: active
            ? const <BoxShadow>[
                BoxShadow(
                  color: Color(0x221DD5C3),
                  blurRadius: 16,
                  offset: Offset(0, 6),
                ),
              ]
            : null,
      ),
      child: Row(
        children: <Widget>[
          Icon(icon, color: Colors.white, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

class _WorkspaceRailCard extends StatelessWidget {
  const _WorkspaceRailCard({
    required this.dashboard,
    required this.sessionEmail,
    required this.onRefresh,
    required this.onLogout,
  });

  final ProfessionalDashboard dashboard;
  final String sessionEmail;
  final VoidCallback? onRefresh;
  final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) {
    final ColorScheme colorScheme = Theme.of(context).colorScheme;
    final professional = dashboard.professional;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: <Color>[
            Color(0xFF08262B),
            Color(0xFF0A454B),
            Color(0xFF0E6864),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(32),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.08),
        ),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x2A000000),
            blurRadius: 28,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Container(
            width: 54,
            height: 54,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Image.asset(
              'assets/brand/opera-clinica-logo.png',
              fit: BoxFit.contain,
            ),
          ),
          const SizedBox(height: 18),
          Text(
            'Painel do profissional',
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: Colors.white70,
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            dashboard.professionalDisplayName,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            sessionEmail,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Colors.white.withValues(alpha: 0.78),
                ),
          ),
          const SizedBox(height: 16),
          _RailInfoTile(
            icon: Icons.badge_outlined,
            title: 'Credencial',
            value: professional.credential.isEmpty
                ? 'Perfil profissional'
                : professional.credential,
          ),
          const SizedBox(height: 10),
          _RailInfoTile(
            icon: Icons.apartment_outlined,
            title: 'Clinica',
            value: dashboard.clinicDisplayName ?? 'Workspace profissional',
          ),
          const SizedBox(height: 18),
          const _RailNavGroup(),
          const SizedBox(height: 18),
          Text(
            'Pulso rapido',
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 10),
          _RailMetric(
            label: 'Fila em espera',
            value: '${dashboard.summary.checkedInWaiting}',
          ),
          const SizedBox(height: 8),
          _RailMetric(
            label: 'Pendencias do dia',
            value: '${dashboard.summary.pendingConfirmation}',
          ),
          const SizedBox(height: 8),
          _RailMetric(
            label: 'Na recepcao',
            value: '${dashboard.summary.sentToReception}',
          ),
          const SizedBox(height: 8),
          _RailMetric(
            label: 'Concluidos',
            value: '${dashboard.summary.completedToday}',
          ),
          const SizedBox(height: 18),
          _RailJourneyCard(summary: dashboard.summary),
          const SizedBox(height: 18),
          FilledButton.tonalIcon(
            onPressed: onRefresh,
            style: FilledButton.styleFrom(
              backgroundColor: Colors.white.withValues(alpha: 0.12),
              foregroundColor: Colors.white,
            ),
            icon: const Icon(Icons.refresh),
            label: const Text('Atualizar workspace'),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: onLogout,
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.white,
              side: BorderSide(color: Colors.white.withValues(alpha: 0.22)),
            ),
            icon: const Icon(Icons.logout),
            label: const Text('Encerrar sessao'),
          ),
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Icon(
                  Icons.insights_outlined,
                  color: colorScheme.primaryContainer,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Workspace pensado como console operacional: fila, execucao clinica e devolucao para recepcao.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Colors.white.withValues(alpha: 0.76),
                          height: 1.35,
                        ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RailInfoTile extends StatelessWidget {
  const _RailInfoTile({
    required this.icon,
    required this.title,
    required this.value,
  });

  final IconData icon;
  final String title;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, color: Colors.white),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  title,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: Colors.white70,
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Colors.white,
                        height: 1.3,
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RailMetric extends StatelessWidget {
  const _RailMetric({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: <Color>[
            Color(0x14FFFFFF),
            Color(0x0DFFFFFF),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.06),
        ),
      ),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Colors.white.withValues(alpha: 0.78),
                  ),
            ),
          ),
          Text(
            value,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
          ),
        ],
      ),
    );
  }
}

class _RailJourneyCard extends StatelessWidget {
  const _RailJourneyCard({
    required this.summary,
  });

  final ProfessionalDashboardSummary summary;

  @override
  Widget build(BuildContext context) {
    final String activeStage = _DashboardFormatters.activeJourneyStage(summary);
    final List<_JourneyStageData> stages = <_JourneyStageData>[
      _JourneyStageData(
        key: 'CHECKED_IN',
        title: 'Check-in',
        subtitle: '',
        count: summary.checkedInWaiting,
        icon: Icons.how_to_reg_rounded,
        accent: const Color(0xFF7AF2E3),
      ),
      _JourneyStageData(
        key: 'CALLED',
        title: 'Chamado',
        subtitle: '',
        count: summary.calledToRoom,
        icon: Icons.campaign_rounded,
        accent: const Color(0xFF82E9FF),
      ),
      _JourneyStageData(
        key: 'IN_PROGRESS',
        title: 'Execucao',
        subtitle: '',
        count: summary.inProgress,
        icon: Icons.play_circle_fill_rounded,
        accent: const Color(0xFF91B7FF),
      ),
      _JourneyStageData(
        key: 'AWAITING_CLOSURE',
        title: 'Fechamento',
        subtitle: '',
        count: summary.awaitingClosure,
        icon: Icons.assignment_turned_in_rounded,
        accent: const Color(0xFFCBB9FF),
      ),
      _JourneyStageData(
        key: 'AWAITING_PAYMENT',
        title: 'Recepcao',
        subtitle: '',
        count: summary.sentToReception,
        icon: Icons.point_of_sale_rounded,
        accent: const Color(0xFFFFD17D),
      ),
    ];

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            'Fluxo do paciente',
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            _DashboardFormatters.journeyBanner(summary),
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Colors.white.withValues(alpha: 0.72),
                  height: 1.35,
                ),
          ),
          const SizedBox(height: 12),
          ...stages.map(
            (_JourneyStageData stage) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _RailJourneyRow(
                stage: stage,
                isActive: stage.key == activeStage,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RailJourneyRow extends StatelessWidget {
  const _RailJourneyRow({
    required this.stage,
    required this.isActive,
  });

  final _JourneyStageData stage;
  final bool isActive;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: isActive
            ? Colors.white.withValues(alpha: 0.14)
            : Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: isActive
              ? stage.accent.withValues(alpha: 0.22)
              : Colors.transparent,
        ),
      ),
      child: Row(
        children: <Widget>[
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: stage.accent.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(stage.icon, color: stage.accent, size: 16),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              stage.title,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    color: Colors.white,
                    fontWeight: isActive ? FontWeight.w800 : FontWeight.w700,
                  ),
            ),
          ),
          Text(
            '${stage.count}',
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: stage.accent,
                  fontWeight: FontWeight.w800,
                ),
          ),
        ],
      ),
    );
  }
}

class _DashboardHeroCard extends StatelessWidget {
  const _DashboardHeroCard({
    required this.dashboard,
    required this.sessionEmail,
  });

  final ProfessionalDashboard dashboard;
  final String sessionEmail;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final specialties = dashboard.professional.specialties
        .map((ProfessionalNamedEntity item) => item.name)
        .where((String value) => value.trim().isNotEmpty)
        .join(' • ');
    final units = dashboard.professional.units
        .map((ProfessionalNamedEntity item) => item.name)
        .where((String value) => value.trim().isNotEmpty)
        .join(' • ');

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: <Color>[
            Color(0xFFB9F3EC),
            Color(0xFFE7FFFC),
            Colors.white,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(30),
        border: Border.all(
          color: const Color(0xFFBEF0EA),
        ),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x16000000),
            blurRadius: 24,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Wrap(
            spacing: 10,
            runSpacing: 10,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: <Widget>[
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.92),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Image.asset(
                  'assets/brand/opera-clinica-icon.png',
                  fit: BoxFit.contain,
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.92),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  dashboard.clinicDisplayName ?? 'Area do profissional',
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: colorScheme.primary,
                      ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Text(
            dashboard.professionalDisplayName,
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            'Workspace para agenda, contexto do paciente e execucao do atendimento em um unico fluxo.',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                  height: 1.35,
                ),
          ),
          const SizedBox(height: 18),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: <Widget>[
              _SignalStat(
                label: 'Fila viva',
                value: '${dashboard.summary.checkedInWaiting}',
                icon: Icons.groups_2_outlined,
                accent: const Color(0xFF0B8A83),
              ),
              _SignalStat(
                label: 'Em execucao',
                value: '${dashboard.summary.inProgress}',
                icon: Icons.play_circle_outline,
                accent: const Color(0xFF2878FF),
              ),
              _SignalStat(
                label: 'Na recepcao',
                value: '${dashboard.summary.sentToReception}',
                icon: Icons.point_of_sale_outlined,
                accent: const Color(0xFFAA6C00),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: <Widget>[
              _InfoChip(
                icon: Icons.calendar_today_outlined,
                label: _DashboardFormatters.dayKey(dashboard.date),
              ),
              _InfoChip(
                icon: Icons.badge_outlined,
                label: dashboard.professional.credential.isEmpty
                    ? 'Credencial profissional'
                    : dashboard.professional.credential,
              ),
              _InfoChip(
                icon: Icons.mail_outline,
                label: sessionEmail,
              ),
            ],
          ),
          if (specialties.isNotEmpty || units.isNotEmpty) ...<Widget>[
            const SizedBox(height: 18),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: <Widget>[
                if (specialties.isNotEmpty)
                  _ContextPill(
                    title: 'Especialidades',
                    value: specialties,
                  ),
                if (units.isNotEmpty)
                  _ContextPill(
                    title: 'Unidades',
                    value: units,
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _MissionControlCard extends StatelessWidget {
  const _MissionControlCard({
    required this.dashboard,
  });

  final ProfessionalDashboard dashboard;

  @override
  Widget build(BuildContext context) {
    final ProfessionalAgendaItem? priorityItem =
        dashboard.focus.currentAppointment ??
            dashboard.focus.closingAppointment ??
            dashboard.focus.calledPatient ??
            dashboard.focus.waitingPatient ??
            dashboard.focus.nextAppointment;
    final int total = dashboard.summary.appointmentsToday;
    final int completed = dashboard.summary.completedToday;
    final double progress =
        total == 0 ? 0 : (completed / total).clamp(0, 1).toDouble();
    final String score = '${(progress * 100).round()}%';

    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: <Color>[
            Color(0xFF08161A),
            Color(0xFF0E2E35),
            Color(0xFF133E46),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(32),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.08),
        ),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x26000000),
            blurRadius: 28,
            offset: Offset(0, 14),
          ),
        ],
      ),
      child: LayoutBuilder(
        builder: (BuildContext context, BoxConstraints constraints) {
          final bool compact = constraints.maxWidth < 860;

          final Widget progressBadge = Container(
            width: compact ? double.infinity : 184,
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(26),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.08),
              ),
            ),
            child: Column(
              crossAxisAlignment: compact
                  ? CrossAxisAlignment.start
                  : CrossAxisAlignment.center,
              children: <Widget>[
                _CircularTurnMeter(progress: progress),
                const SizedBox(height: 14),
                Text(
                  score,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                      ),
                ),
                const SizedBox(height: 4),
                Text(
                  _DashboardFormatters.turnMood(dashboard.summary),
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        color: const Color(0xFFA3F1E7),
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 6),
                Text(
                  '$completed de $total etapas clinicas encerradas',
                  textAlign: compact ? TextAlign.start : TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.white.withValues(alpha: 0.7),
                        height: 1.35,
                      ),
                ),
              ],
            ),
          );

          final Widget missionBody = Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFF16B6AA).withValues(alpha: 0.16),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        const Icon(
                          Icons.videogame_asset_rounded,
                          size: 16,
                          color: Color(0xFFA3F1E7),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'Mission control',
                          style:
                              Theme.of(context).textTheme.labelLarge?.copyWith(
                                    color: const Color(0xFFA3F1E7),
                                    fontWeight: FontWeight.w800,
                                  ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Text(
                priorityItem == null
                    ? 'Fila estabilizada. O workspace fica pronto para o proximo movimento.'
                    : _DashboardFormatters.missionHeadline(priorityItem),
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      height: 1.1,
                    ),
              ),
              const SizedBox(height: 10),
              Text(
                priorityItem == null
                    ? 'Use o painel para monitorar proximos retornos, recepcao e concluidos do turno.'
                    : _DashboardFormatters.missionSupport(priorityItem),
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: Colors.white.withValues(alpha: 0.76),
                      height: 1.45,
                    ),
              ),
              const SizedBox(height: 18),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: <Widget>[
                  _MissionTag(
                    icon: Icons.local_fire_department_rounded,
                    label: '${dashboard.summary.inProgress} ativos agora',
                    accent: const Color(0xFF3C86FF),
                  ),
                  _MissionTag(
                    icon: Icons.groups_2_rounded,
                    label: '${dashboard.summary.checkedInWaiting} em espera',
                    accent: const Color(0xFF16B6AA),
                  ),
                  _MissionTag(
                    icon: Icons.point_of_sale_rounded,
                    label: '${dashboard.summary.sentToReception} na recepcao',
                    accent: const Color(0xFFEEB11C),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.08),
                  ),
                ),
                child: Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: <Widget>[
                    _MissionMiniStat(
                      icon: Icons.route_rounded,
                      label: 'Proxima jogada',
                      value: priorityItem == null
                          ? 'Aguardar nova entrada'
                          : _DashboardFormatters.nextActionLabel(priorityItem),
                    ),
                    _MissionMiniStat(
                      icon: Icons.workspace_premium_rounded,
                      label: 'Nivel do turno',
                      value: _DashboardFormatters.turnLevel(dashboard.summary),
                    ),
                    _MissionMiniStat(
                      icon: Icons.emoji_events_rounded,
                      label: 'Meta de hoje',
                      value: '$completed/$total concluidos',
                    ),
                  ],
                ),
              ),
            ],
          );

          if (compact) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                missionBody,
                const SizedBox(height: 16),
                progressBadge,
              ],
            );
          }

          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Expanded(child: missionBody),
              const SizedBox(width: 18),
              progressBadge,
            ],
          );
        },
      ),
    );
  }
}

class _PatientJourneyCard extends StatelessWidget {
  const _PatientJourneyCard({
    required this.summary,
  });

  final ProfessionalDashboardSummary summary;

  @override
  Widget build(BuildContext context) {
    final ColorScheme colorScheme = Theme.of(context).colorScheme;
    final String activeStage = _DashboardFormatters.activeJourneyStage(summary);
    final List<_JourneyStageData> stages = <_JourneyStageData>[
      _JourneyStageData(
        key: 'CHECKED_IN',
        title: 'Check-in',
        subtitle: 'Recepcao liberou para a fila',
        count: summary.checkedInWaiting,
        icon: Icons.how_to_reg_rounded,
        accent: const Color(0xFF119A8B),
      ),
      _JourneyStageData(
        key: 'CALLED',
        title: 'Chamado',
        subtitle: 'Paciente a caminho da sala',
        count: summary.calledToRoom,
        icon: Icons.campaign_rounded,
        accent: const Color(0xFF0E9BB2),
      ),
      _JourneyStageData(
        key: 'IN_PROGRESS',
        title: 'Em atendimento',
        subtitle: 'Execucao clinica em curso',
        count: summary.inProgress,
        icon: Icons.play_circle_fill_rounded,
        accent: const Color(0xFF2F7DFF),
      ),
      _JourneyStageData(
        key: 'AWAITING_CLOSURE',
        title: 'Fechamento',
        subtitle: 'Orientacoes e final clinico',
        count: summary.awaitingClosure,
        icon: Icons.assignment_turned_in_rounded,
        accent: const Color(0xFF825AF2),
      ),
      _JourneyStageData(
        key: 'AWAITING_PAYMENT',
        title: 'Recepcao',
        subtitle: 'Pagamento e baixa final',
        count: summary.sentToReception,
        icon: Icons.point_of_sale_rounded,
        accent: const Color(0xFFB67600),
      ),
    ];

    return Card(
      elevation: 0,
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          Container(
                            width: 34,
                            height: 34,
                            decoration: BoxDecoration(
                              color: colorScheme.secondaryContainer,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Icon(
                              Icons.route_rounded,
                              color: colorScheme.secondary,
                              size: 18,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Text(
                            'Fluxo assistido',
                            style: Theme.of(context)
                                .textTheme
                                .labelLarge
                                ?.copyWith(
                                  color: colorScheme.secondary,
                                  fontWeight: FontWeight.w800,
                                ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'Jornada do paciente',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w800,
                            ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Do check-in ao retorno para recepcao. Esta trilha mostra onde a fila esta concentrada agora.',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: colorScheme.onSurfaceVariant,
                              height: 1.35,
                            ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    _DashboardFormatters.journeyBanner(summary),
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                          color: colorScheme.onPrimaryContainer,
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            LayoutBuilder(
              builder: (BuildContext context, BoxConstraints constraints) {
                final bool compact = constraints.maxWidth < 980;

                if (compact) {
                  return Column(
                    children: List<Widget>.generate(stages.length, (int index) {
                      final _JourneyStageData stage = stages[index];
                      return Padding(
                        padding: EdgeInsets.only(
                          bottom: index == stages.length - 1 ? 0 : 12,
                        ),
                        child: _JourneyStageTile(
                          stage: stage,
                          isActive: stage.key == activeStage,
                          showConnector: index != stages.length - 1,
                          compact: true,
                        ),
                      );
                    }),
                  );
                }

                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: List<Widget>.generate(stages.length, (int index) {
                    final _JourneyStageData stage = stages[index];
                    return Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(
                          right: index == stages.length - 1 ? 0 : 10,
                        ),
                        child: _JourneyStageTile(
                          stage: stage,
                          isActive: stage.key == activeStage,
                          showConnector: index != stages.length - 1,
                        ),
                      ),
                    );
                  }),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _JourneyStageData {
  const _JourneyStageData({
    required this.key,
    required this.title,
    required this.subtitle,
    required this.count,
    required this.icon,
    required this.accent,
  });

  final String key;
  final String title;
  final String subtitle;
  final int count;
  final IconData icon;
  final Color accent;
}

class _JourneyStageTile extends StatelessWidget {
  const _JourneyStageTile({
    required this.stage,
    required this.isActive,
    required this.showConnector,
    this.compact = false,
  });

  final _JourneyStageData stage;
  final bool isActive;
  final bool showConnector;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final Widget tile = Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: <Color>[
            stage.accent.withValues(alpha: isActive ? 0.18 : 0.08),
            stage.accent.withValues(alpha: isActive ? 0.08 : 0.03),
          ],
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: stage.accent.withValues(alpha: isActive ? 0.34 : 0.12),
        ),
        boxShadow: isActive
            ? <BoxShadow>[
                BoxShadow(
                  color: stage.accent.withValues(alpha: 0.16),
                  blurRadius: 20,
                  offset: const Offset(0, 10),
                ),
              ]
            : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: stage.accent.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(stage.icon, color: stage.accent),
              ),
              const Spacer(),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.82),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  '${stage.count}',
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        color: stage.accent,
                        fontWeight: FontWeight.w800,
                      ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            stage.title,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 4),
          Text(
            stage.subtitle,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  height: 1.35,
                ),
          ),
          if (isActive) ...<Widget>[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: stage.accent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                'Etapa em destaque',
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: stage.accent,
                      fontWeight: FontWeight.w800,
                    ),
              ),
            ),
          ],
        ],
      ),
    );

    if (compact || !showConnector) {
      return tile;
    }

    return Row(
      children: <Widget>[
        Expanded(child: tile),
        if (showConnector) ...<Widget>[
          const SizedBox(width: 10),
          Padding(
            padding: const EdgeInsets.only(top: 36),
            child: Icon(
              Icons.arrow_forward_rounded,
              color: stage.accent.withValues(alpha: 0.45),
            ),
          ),
        ],
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.eyebrow,
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final String eyebrow;
  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                icon,
                color: Theme.of(context).colorScheme.primary,
                size: 18,
              ),
            ),
            const SizedBox(width: 10),
            Text(
              eyebrow,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    color: Theme.of(context).colorScheme.primary,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.2,
                  ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Text(
          title,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 4),
        Text(
          subtitle,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                height: 1.35,
              ),
        ),
      ],
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({
    required this.icon,
    required this.label,
  });

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: Colors.black.withValues(alpha: 0.05),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, size: 18),
          const SizedBox(width: 8),
          Flexible(child: Text(label)),
        ],
      ),
    );
  }
}

class _SignalStat extends StatelessWidget {
  const _SignalStat({
    required this.label,
    required this.value,
    required this.icon,
    required this.accent,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 152),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.86),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: accent.withValues(alpha: 0.16),
        ),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: accent.withValues(alpha: 0.12),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: accent, size: 20),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                value,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              Text(
                label,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                      fontWeight: FontWeight.w700,
                    ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CircularTurnMeter extends StatelessWidget {
  const _CircularTurnMeter({
    required this.progress,
  });

  final double progress;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 92,
      height: 92,
      child: Stack(
        alignment: Alignment.center,
        children: <Widget>[
          SizedBox.expand(
            child: CircularProgressIndicator(
              value: progress,
              strokeWidth: 10,
              backgroundColor: Colors.white.withValues(alpha: 0.12),
              valueColor: const AlwaysStoppedAnimation<Color>(
                Color(0xFFA3F1E7),
              ),
            ),
          ),
          Container(
            width: 62,
            height: 62,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.08),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.flash_on_rounded,
              color: Color(0xFFA3F1E7),
              size: 28,
            ),
          ),
        ],
      ),
    );
  }
}

class _MissionTag extends StatelessWidget {
  const _MissionTag({
    required this.icon,
    required this.label,
    required this.accent,
  });

  final IconData icon;
  final String label;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: accent.withValues(alpha: 0.2),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, size: 16, color: accent),
          const SizedBox(width: 8),
          Text(
            label,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
          ),
        ],
      ),
    );
  }
}

class _MissionMiniStat extends StatelessWidget {
  const _MissionMiniStat({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 170),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(
            icon,
            size: 18,
            color: const Color(0xFFA3F1E7),
          ),
          const SizedBox(width: 10),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  label,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: Colors.white.withValues(alpha: 0.68),
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ContextPill extends StatelessWidget {
  const _ContextPill({
    required this.title,
    required this.value,
  });

  final String title;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 220, maxWidth: 420),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.88),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            title,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
        ],
      ),
    );
  }
}

class _InlineMessage extends StatelessWidget {
  const _InlineMessage({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(
            Icons.error_outline,
            color: colorScheme.onErrorContainer,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(color: colorScheme.onErrorContainer),
            ),
          ),
        ],
      ),
    );
  }
}

class _FocusCard extends StatelessWidget {
  const _FocusCard({
    required this.priorityLabel,
    required this.title,
    required this.emptyLabel,
    required this.item,
    required this.primaryActionLabel,
    required this.primaryActionIcon,
    required this.secondaryActionLabel,
    required this.secondaryActionIcon,
    required this.isBusy,
    required this.onPrimaryAction,
    required this.onSecondaryAction,
  });

  final String priorityLabel;
  final String title;
  final String emptyLabel;
  final ProfessionalAgendaItem? item;
  final String primaryActionLabel;
  final IconData primaryActionIcon;
  final String secondaryActionLabel;
  final IconData secondaryActionIcon;
  final bool isBusy;
  final VoidCallback? onPrimaryAction;
  final VoidCallback? onSecondaryAction;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final agendaItem = item;
    final _StatusTone tone = _StatusTone.fromStatus(
      agendaItem?.status ?? 'CHECKED_IN',
      colorScheme,
    );

    return Card(
      elevation: 0,
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: <Color>[
                        tone.accent.withValues(alpha: 0.2),
                        tone.accent.withValues(alpha: 0.08),
                      ],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: <BoxShadow>[
                      BoxShadow(
                        color: tone.accent.withValues(alpha: 0.16),
                        blurRadius: 18,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: Icon(
                    tone.icon,
                    color: tone.accent,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        priorityLabel.toUpperCase(),
                        style:
                            Theme.of(context).textTheme.labelMedium?.copyWith(
                                  color: tone.accent,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.25,
                                ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        title,
                        style:
                            Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                      ),
                    ],
                  ),
                ),
                if (agendaItem != null)
                  _StatusChip(
                    status: agendaItem.status,
                    compact: true,
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              height: 4,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: <Color>[
                    tone.accent,
                    tone.accent.withValues(alpha: 0.12),
                  ],
                ),
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            const SizedBox(height: 14),
            if (agendaItem == null)
              Text(
                emptyLabel,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: colorScheme.onSurfaceVariant,
                      height: 1.35,
                    ),
              )
            else ...<Widget>[
              _OperationalBanner(
                icon: Icons.route_rounded,
                label: _DashboardFormatters.stepBadge(agendaItem.status),
                accent: tone.accent,
                value: _DashboardFormatters.nextActionLabel(agendaItem),
                compact: true,
              ),
              const SizedBox(height: 14),
              Text(
                _DashboardFormatters.timeRange(
                  agendaItem.startsAt,
                  agendaItem.endsAt,
                ),
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 8),
              Text(
                agendaItem.patientName,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 6),
              Text(
                agendaItem.consultationTypeName,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: colorScheme.onSurfaceVariant,
                    ),
              ),
              const SizedBox(height: 14),
              _WorkflowTrack(
                status: agendaItem.status,
                compact: true,
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: <Widget>[
                  if (agendaItem.unitName != null &&
                      agendaItem.unitName!.isNotEmpty)
                    _MetaPill(
                      icon: Icons.location_on_outlined,
                      label: agendaItem.unitName!,
                    ),
                  if (agendaItem.room != null && agendaItem.room!.isNotEmpty)
                    _MetaPill(
                      icon: Icons.door_front_door_outlined,
                      label: _DashboardFormatters.roomLabel(agendaItem.room!),
                    ),
                  if (agendaItem.patientPrimaryContact != null &&
                      agendaItem.patientPrimaryContact!.isNotEmpty)
                    _MetaPill(
                      icon: Icons.call_outlined,
                      label: agendaItem.patientPrimaryContact!,
                    ),
                ],
              ),
              if (isBusy) ...<Widget>[
                const SizedBox(height: 12),
                const LinearProgressIndicator(),
              ],
              const SizedBox(height: 14),
              Row(
                children: <Widget>[
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: isBusy ? null : onPrimaryAction,
                      icon: Icon(primaryActionIcon),
                      label: Text(primaryActionLabel),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: isBusy ? null : onSecondaryAction,
                      icon: Icon(secondaryActionIcon),
                      label: Text(secondaryActionLabel),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.title,
    required this.value,
    required this.icon,
  });

  final String title;
  final int value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final ColorScheme colorScheme = Theme.of(context).colorScheme;
    final Color accent = switch (title) {
      'Em atendimento' => const Color(0xFF2878FF),
      'Na recepcao' => const Color(0xFFB67600),
      'Pendentes' => const Color(0xFFC65B00),
      'Chamados' => const Color(0xFF0F938A),
      'Em espera' => const Color(0xFF1A998F),
      'Fechamento' => const Color(0xFF8359F3),
      'Concluidos' => const Color(0xFF149B65),
      _ => colorScheme.primary,
    };

    return Card(
      elevation: 0,
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: accent),
            ),
            const SizedBox(height: 14),
            Text(
              '$value',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 6),
            Text(
              title,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
            const SizedBox(height: 14),
            Container(
              height: 4,
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(999),
              ),
              child: FractionallySizedBox(
                alignment: Alignment.centerLeft,
                widthFactor: (value.clamp(0, 6) / 6).clamp(0.12, 1).toDouble(),
                child: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: <Color>[
                        accent,
                        accent.withValues(alpha: 0.44),
                      ],
                    ),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ShiftProgressCard extends StatelessWidget {
  const _ShiftProgressCard({
    required this.summary,
  });

  final ProfessionalDashboardSummary summary;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final int total = summary.appointmentsToday;
    final int completed = summary.completedToday;
    final double progress =
        total == 0 ? 0 : (completed / total).clamp(0, 1).toDouble();
    final String headline;

    if (total == 0) {
      headline = 'Plantao sem fila aberta no momento';
    } else if (completed == total) {
      headline = 'Fila do dia concluida';
    } else if (summary.awaitingClosure > 0) {
      headline = 'Existem atendimentos aguardando fechamento';
    } else if (summary.inProgress > 0) {
      headline = 'Ritmo ativo de atendimento';
    } else if (summary.checkedInWaiting > 0 || summary.calledToRoom > 0) {
      headline = 'Fila pronta para avancar';
    } else {
      headline = 'Agenda sob controle';
    }

    return Card(
      elevation: 0,
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: <Color>[
                        Color(0xFF19B3A7),
                        Color(0xFF0D8D89),
                      ],
                    ),
                    borderRadius: BorderRadius.circular(999),
                    boxShadow: const <BoxShadow>[
                      BoxShadow(
                        color: Color(0x2619B3A7),
                        blurRadius: 14,
                        offset: Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Text(
                    'Ritmo do plantao',
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                ),
                const Spacer(),
                Text(
                  '$completed/$total concluidos',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              headline,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              'Fila ao vivo: check-in, chamada para sala, execucao e fechamento aparecem automaticamente no workspace.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                    height: 1.35,
                  ),
            ),
            const SizedBox(height: 14),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                minHeight: 12,
                value: progress,
                backgroundColor:
                    colorScheme.surfaceContainerHighest.withValues(alpha: 0.8),
              ),
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: <Widget>[
                _MetaPill(
                  icon: Icons.play_circle_outline,
                  label: '${summary.inProgress} em execucao',
                ),
                _MetaPill(
                  icon: Icons.assignment_turned_in_outlined,
                  label: '${summary.awaitingClosure} em fechamento',
                ),
                _MetaPill(
                  icon: Icons.point_of_sale_outlined,
                  label: '${summary.sentToReception} na recepcao',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _WorkflowTrack extends StatelessWidget {
  const _WorkflowTrack({
    required this.status,
    this.compact = false,
  });

  final String status;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final steps = <MapEntry<String, String>>[
      const MapEntry<String, String>('CHECKED_IN', 'Check-in'),
      const MapEntry<String, String>('CALLED', 'Chamado'),
      const MapEntry<String, String>('IN_PROGRESS', 'Execucao'),
      const MapEntry<String, String>('AWAITING_CLOSURE', 'Fechamento'),
      const MapEntry<String, String>('AWAITING_PAYMENT', 'Recepcao'),
      const MapEntry<String, String>('COMPLETED', 'Concluido'),
    ];

    final currentIndex = _DashboardFormatters.workflowStepIndex(status);
    final colorScheme = Theme.of(context).colorScheme;
    final _StatusTone tone = _StatusTone.fromStatus(status, colorScheme);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          'Trilha do atendimento',
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w700,
              ),
        ),
        SizedBox(height: compact ? 8 : 10),
        Wrap(
          spacing: compact ? 8 : 10,
          runSpacing: compact ? 8 : 10,
          children: List<Widget>.generate(steps.length, (int index) {
            final isCompleted = index <= currentIndex;
            final isCurrent = index == currentIndex;

            return Container(
              padding: EdgeInsets.symmetric(
                horizontal: compact ? 10 : 12,
                vertical: compact ? 8 : 10,
              ),
              decoration: BoxDecoration(
                gradient: isCompleted
                    ? LinearGradient(
                        colors: <Color>[
                          tone.accent.withValues(
                            alpha: isCurrent ? 0.22 : 0.16,
                          ),
                          tone.accent.withValues(alpha: 0.08),
                        ],
                      )
                    : null,
                color: isCompleted
                    ? null
                    : colorScheme.surfaceContainerHighest.withValues(
                        alpha: 0.9,
                      ),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(
                  color: isCurrent
                      ? tone.accent
                      : isCompleted
                          ? tone.accent.withValues(alpha: 0.18)
                          : Colors.transparent,
                ),
                boxShadow: isCurrent
                    ? <BoxShadow>[
                        BoxShadow(
                          color: tone.accent.withValues(alpha: 0.16),
                          blurRadius: 16,
                          offset: const Offset(0, 8),
                        ),
                      ]
                    : null,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Icon(
                    isCompleted
                        ? Icons.check_circle
                        : Icons.radio_button_unchecked,
                    size: compact ? 16 : 18,
                    color: isCompleted
                        ? tone.accent
                        : colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    steps[index].value,
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: isCompleted
                              ? tone.accent
                              : colorScheme.onSurfaceVariant,
                          fontSize: compact ? 12 : null,
                        ),
                  ),
                ],
              ),
            );
          }),
        ),
      ],
    );
  }
}

class _AgendaCard extends StatelessWidget {
  const _AgendaCard({
    required this.item,
    required this.isBusy,
    required this.onViewPatient,
    required this.onEditNotes,
    required this.onCall,
    required this.onStart,
    required this.onPrepareClosure,
    required this.onComplete,
    required this.onNoShow,
  });

  final ProfessionalAgendaItem item;
  final bool isBusy;
  final VoidCallback onViewPatient;
  final VoidCallback onEditNotes;
  final VoidCallback onCall;
  final VoidCallback onStart;
  final VoidCallback onPrepareClosure;
  final VoidCallback onComplete;
  final VoidCallback onNoShow;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final _StatusTone tone = _StatusTone.fromStatus(item.status, colorScheme);
    final bool isFinalized = _DashboardFormatters.isFinalized(item.status);
    final bool canCall = _DashboardFormatters.canCall(item);
    final bool canStart = _DashboardFormatters.canStart(item);
    final bool canPrepareClosure = _DashboardFormatters.canPrepareClosure(item);
    final bool canComplete = _DashboardFormatters.canComplete(item);
    final bool canNoShow = _DashboardFormatters.canNoShow(item);
    final String? ageLabel =
        _DashboardFormatters.ageLabel(item.patientBirthDate);
    final String nextActionLabel = _DashboardFormatters.nextActionLabel(item);
    final ButtonStyle outlinedActionStyle = OutlinedButton.styleFrom(
      minimumSize: const Size(0, 48),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    );
    final ButtonStyle filledActionStyle = FilledButton.styleFrom(
      minimumSize: const Size(0, 48),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    );

    return Card(
      elevation: 0,
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Container(
              height: 5,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: <Color>[
                    tone.accent,
                    tone.accent.withValues(alpha: 0.15),
                  ],
                ),
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            const SizedBox(height: 16),
            _OperationalBanner(
              icon: tone.icon,
              label: _DashboardFormatters.statusSignal(item.status),
              accent: tone.accent,
              value: _DashboardFormatters.statusLabel(item.status),
            ),
            const SizedBox(height: 16),
            _OperationalBanner(
              icon: Icons.touch_app_rounded,
              label: 'Proxima jogada',
              accent: colorScheme.secondary,
              value: nextActionLabel,
              compact: true,
            ),
            const SizedBox(height: 16),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        _DashboardFormatters.timeRange(
                          item.startsAt,
                          item.endsAt,
                        ),
                        style: textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        item.patientName,
                        style: textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        item.consultationTypeName,
                        style: textTheme.bodyMedium?.copyWith(
                          color: colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                _StatusChip(status: item.status),
              ],
            ),
            const SizedBox(height: 14),
            _WorkflowTrack(status: item.status),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: <Widget>[
                if (ageLabel != null)
                  _MetaPill(
                    icon: Icons.cake_outlined,
                    label: ageLabel,
                  ),
                if (item.unitName != null && item.unitName!.isNotEmpty)
                  _MetaPill(
                    icon: Icons.location_on_outlined,
                    label: item.unitName!,
                  ),
                if (item.room != null && item.room!.isNotEmpty)
                  _MetaPill(
                    icon: Icons.door_front_door_outlined,
                    label: _DashboardFormatters.roomLabel(item.room!),
                  ),
                if (item.patientPrimaryContact != null &&
                    item.patientPrimaryContact!.isNotEmpty)
                  _MetaPill(
                    icon: Icons.call_outlined,
                    label: item.patientPrimaryContact!,
                  ),
                if (item.checkedInAt != null && item.checkedInAt!.isNotEmpty)
                  _MetaPill(
                    icon: Icons.login_outlined,
                    label:
                        'Check-in ${_DashboardFormatters.time(item.checkedInAt!)}',
                  ),
                if (item.calledAt != null && item.calledAt!.isNotEmpty)
                  _MetaPill(
                    icon: Icons.campaign_outlined,
                    label:
                        'Chamado ${_DashboardFormatters.time(item.calledAt!)}',
                  ),
                if (item.startedAt != null && item.startedAt!.isNotEmpty)
                  _MetaPill(
                    icon: Icons.play_arrow_rounded,
                    label:
                        'Inicio ${_DashboardFormatters.time(item.startedAt!)}',
                  ),
                if (item.closureReadyAt != null &&
                    item.closureReadyAt!.isNotEmpty)
                  _MetaPill(
                    icon: Icons.assignment_turned_in_outlined,
                    label:
                        'Fechamento ${_DashboardFormatters.time(item.closureReadyAt!)}',
                  ),
                if (item.completedAt != null && item.completedAt!.isNotEmpty)
                  _MetaPill(
                    icon: Icons.check_circle_outline,
                    label:
                        'Baixa ${_DashboardFormatters.time(item.completedAt!)}',
                  ),
                if (item.awaitingPaymentAt != null &&
                    item.awaitingPaymentAt!.isNotEmpty)
                  _MetaPill(
                    icon: Icons.point_of_sale_outlined,
                    label:
                        'Recepcao ${_DashboardFormatters.time(item.awaitingPaymentAt!)}',
                  ),
              ],
            ),
            if (item.hasHistoricalIntercurrence ||
                (item.lastIntercurrenceSummary?.trim().isNotEmpty ??
                    false)) ...<Widget>[
              const SizedBox(height: 14),
              _ContextPanel(
                icon: Icons.warning_amber_rounded,
                title: 'Intercorrencia anterior',
                message: item.lastIntercurrenceSummary?.trim().isNotEmpty ??
                        false
                    ? item.lastIntercurrenceSummary!
                    : 'Paciente com historico de intercorrencia em atendimento anterior.',
                toneColor: colorScheme.errorContainer,
                toneForeground: colorScheme.onErrorContainer,
                footer: item.lastIntercurrenceAt != null
                    ? 'Ultimo registro em ${_DashboardFormatters.dateTime(item.lastIntercurrenceAt!)}'
                    : null,
              ),
            ],
            if (item.lastPreparationSummary?.trim().isNotEmpty ??
                false) ...<Widget>[
              const SizedBox(height: 12),
              _ContextPanel(
                icon: Icons.medication_outlined,
                title: 'Preparacao anterior',
                message: item.lastPreparationSummary!,
                toneColor: colorScheme.surfaceContainerHighest,
                toneForeground: colorScheme.onSurface,
              ),
            ],
            if (item.lastGuidanceSummary?.trim().isNotEmpty ??
                false) ...<Widget>[
              const SizedBox(height: 12),
              _ContextPanel(
                icon: Icons.assignment_turned_in_outlined,
                title: 'Orientacao anterior',
                message: item.lastGuidanceSummary!,
                toneColor: colorScheme.secondaryContainer,
                toneForeground: colorScheme.onSecondaryContainer,
              ),
            ],
            if (item.notes?.trim().isNotEmpty ?? false) ...<Widget>[
              const SizedBox(height: 12),
              _ContextPanel(
                icon: Icons.sticky_note_2_outlined,
                title: 'Observacoes do atendimento',
                message: item.notes!,
                toneColor: colorScheme.primaryContainer.withValues(alpha: 0.55),
                toneForeground: colorScheme.onSurface,
              ),
            ],
            if (isBusy) ...<Widget>[
              const SizedBox(height: 14),
              const LinearProgressIndicator(),
            ],
            const SizedBox(height: 14),
            OverflowBar(
              alignment: MainAxisAlignment.start,
              spacing: 8,
              overflowSpacing: 8,
              children: <Widget>[
                OutlinedButton.icon(
                  onPressed: isBusy ? null : onViewPatient,
                  style: outlinedActionStyle,
                  icon: const Icon(Icons.person_outline),
                  label: const Text('Paciente'),
                ),
                OutlinedButton.icon(
                  onPressed: isBusy ? null : onEditNotes,
                  style: outlinedActionStyle,
                  icon: const Icon(Icons.sticky_note_2_outlined),
                  label: const Text('Notas'),
                ),
                if (canCall)
                  FilledButton.tonalIcon(
                    onPressed: isBusy ? null : onCall,
                    style: filledActionStyle,
                    icon: const Icon(Icons.campaign_outlined),
                    label: const Text('Chamar'),
                  ),
                if (canStart)
                  FilledButton.icon(
                    onPressed: isBusy ? null : onStart,
                    style: filledActionStyle,
                    icon: const Icon(Icons.play_arrow_rounded),
                    label: const Text('Iniciar'),
                  ),
                if (canPrepareClosure)
                  FilledButton.tonalIcon(
                    onPressed: isBusy ? null : onPrepareClosure,
                    style: filledActionStyle,
                    icon: const Icon(Icons.assignment_turned_in_outlined),
                    label: const Text('Fechamento'),
                  ),
                if (canComplete)
                  FilledButton.icon(
                    onPressed: isBusy || isFinalized ? null : onComplete,
                    style: filledActionStyle,
                    icon: const Icon(Icons.point_of_sale_outlined),
                    label: const Text('Recepcao'),
                  ),
                if (canNoShow)
                  FilledButton.tonalIcon(
                    onPressed: isBusy || isFinalized ? null : onNoShow,
                    style: filledActionStyle,
                    icon: const Icon(Icons.person_off_outlined),
                    label: const Text('No-show'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _CompactAgendaCard extends StatelessWidget {
  const _CompactAgendaCard({
    required this.item,
    required this.trailingLabel,
    required this.onPressed,
  });

  final ProfessionalAgendaItem item;
  final String trailingLabel;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final _StatusTone tone = _StatusTone.fromStatus(item.status, colorScheme);

    return Card(
      elevation: 0,
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            _OperationalBanner(
              icon: tone.icon,
              label: 'Estado do item',
              accent: tone.accent,
              value: _DashboardFormatters.statusLabel(item.status),
              compact: true,
            ),
            const SizedBox(height: 14),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        _DashboardFormatters.shortDateTimeRange(
                          item.startsAt,
                          item.endsAt,
                        ),
                        style:
                            Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        item.patientName,
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        item.consultationTypeName,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: colorScheme.onSurfaceVariant,
                            ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                _StatusChip(
                  status: item.status,
                  compact: true,
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: <Widget>[
                Expanded(
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: <Widget>[
                      if (item.unitName != null && item.unitName!.isNotEmpty)
                        _MetaPill(
                          icon: Icons.location_on_outlined,
                          label: item.unitName!,
                        ),
                      if (item.room != null && item.room!.isNotEmpty)
                        _MetaPill(
                          icon: Icons.door_front_door_outlined,
                          label: _DashboardFormatters.roomLabel(item.room!),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                OutlinedButton(
                  onPressed: onPressed,
                  child: Text(trailingLabel),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _UpcomingAgendaSection extends StatelessWidget {
  const _UpcomingAgendaSection({
    required this.items,
    required this.isExpanded,
    required this.expandedIds,
    required this.onToggleExpanded,
    required this.onToggleItem,
    required this.onOpenPatient,
  });

  final List<ProfessionalAgendaItem> items;
  final bool isExpanded;
  final Set<String> expandedIds;
  final VoidCallback onToggleExpanded;
  final void Function(String appointmentId) onToggleItem;
  final void Function(ProfessionalAgendaItem item) onOpenPatient;

  @override
  Widget build(BuildContext context) {
    final ProfessionalAgendaItem? nextItem = items.isEmpty ? null : items.first;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        const _SectionHeader(
          eyebrow: 'Sob demanda',
          icon: Icons.upcoming_rounded,
          title: 'Agenda futura',
          subtitle:
              'Mantida compacta para nao competir com a operacao do dia. Expanda so quando precisar preparar contexto.',
        ),
        const SizedBox(height: 12),
        Card(
          elevation: 0,
          clipBehavior: Clip.antiAlias,
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(
                            items.isEmpty
                                ? 'Nenhum agendamento futuro ativo'
                                : '${items.length} agendamento(s) futuro(s) em espera',
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            nextItem == null
                                ? 'Quando houver retornos ou novas sessoes, eles aparecerao aqui sem tomar o foco da fila de hoje.'
                                : 'Proximo preparo: ${nextItem.patientName} em ${_DashboardFormatters.shortDateTimeRange(nextItem.startsAt, nextItem.endsAt)}.',
                            style: Theme.of(context)
                                .textTheme
                                .bodyMedium
                                ?.copyWith(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onSurfaceVariant,
                                  height: 1.35,
                                ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    FilledButton.tonalIcon(
                      onPressed: items.isEmpty ? null : onToggleExpanded,
                      icon: Icon(
                        isExpanded
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined,
                      ),
                      label: Text(
                        isExpanded ? 'Ocultar detalhes' : 'Ver detalhes',
                      ),
                    ),
                  ],
                ),
                if (nextItem != null) ...<Widget>[
                  const SizedBox(height: 14),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: <Widget>[
                      _MetaPill(
                        icon: Icons.person_outline,
                        label: nextItem.patientName,
                      ),
                      _MetaPill(
                        icon: Icons.event_outlined,
                        label: _DashboardFormatters.shortDateTimeRange(
                          nextItem.startsAt,
                          nextItem.endsAt,
                        ),
                      ),
                      if (nextItem.unitName != null &&
                          nextItem.unitName!.isNotEmpty)
                        _MetaPill(
                          icon: Icons.location_on_outlined,
                          label: nextItem.unitName!,
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
        if (isExpanded) ...<Widget>[
          const SizedBox(height: 12),
          ...items.map(
            (ProfessionalAgendaItem item) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _UpcomingAgendaDisclosureCard(
                item: item,
                isExpanded: expandedIds.contains(item.id),
                onToggle: () => onToggleItem(item.id),
                onOpenPatient: () => onOpenPatient(item),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _UpcomingAgendaDisclosureCard extends StatelessWidget {
  const _UpcomingAgendaDisclosureCard({
    required this.item,
    required this.isExpanded,
    required this.onToggle,
    required this.onOpenPatient,
  });

  final ProfessionalAgendaItem item;
  final bool isExpanded;
  final VoidCallback onToggle;
  final VoidCallback onOpenPatient;

  @override
  Widget build(BuildContext context) {
    final ColorScheme colorScheme = Theme.of(context).colorScheme;

    return Card(
      elevation: 0,
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        _DashboardFormatters.shortDateTimeRange(
                          item.startsAt,
                          item.endsAt,
                        ),
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        item.patientName,
                        style: Theme.of(context)
                            .textTheme
                            .titleSmall
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        item.consultationTypeName,
                        style: Theme.of(context)
                            .textTheme
                            .bodyMedium
                            ?.copyWith(color: colorScheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                _StatusChip(
                  status: item.status,
                  compact: true,
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: <Widget>[
                Expanded(
                  child: Text(
                    isExpanded
                        ? 'Detalhes de preparo abertos'
                        : 'Toque para abrir detalhes de preparo',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: colorScheme.onSurfaceVariant,
                        ),
                  ),
                ),
                TextButton.icon(
                  onPressed: onToggle,
                  icon: Icon(
                    isExpanded
                        ? Icons.expand_less_rounded
                        : Icons.expand_more_rounded,
                  ),
                  label: Text(isExpanded ? 'Recolher' : 'Expandir'),
                ),
              ],
            ),
            if (isExpanded) ...<Widget>[
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: <Widget>[
                  if (item.unitName != null && item.unitName!.isNotEmpty)
                    _MetaPill(
                      icon: Icons.location_on_outlined,
                      label: item.unitName!,
                    ),
                  if (item.room != null && item.room!.isNotEmpty)
                    _MetaPill(
                      icon: Icons.door_front_door_outlined,
                      label: _DashboardFormatters.roomLabel(item.room!),
                    ),
                  if (item.patientPrimaryContact != null &&
                      item.patientPrimaryContact!.isNotEmpty)
                    _MetaPill(
                      icon: Icons.call_outlined,
                      label: item.patientPrimaryContact!,
                    ),
                  if (item.notes?.trim().isNotEmpty ?? false)
                    const _MetaPill(
                      icon: Icons.sticky_note_2_outlined,
                      label: 'Ha nota de preparo',
                    ),
                ],
              ),
              if (item.notes?.trim().isNotEmpty ?? false) ...<Widget>[
                const SizedBox(height: 12),
                _ContextPanel(
                  icon: Icons.sticky_note_2_outlined,
                  title: 'Nota de preparo',
                  message: item.notes!,
                  toneColor:
                      colorScheme.primaryContainer.withValues(alpha: 0.42),
                  toneForeground: colorScheme.onSurface,
                ),
              ],
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton.icon(
                  onPressed: onOpenPatient,
                  icon: const Icon(Icons.person_outline),
                  label: const Text('Abrir paciente'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ContextPanel extends StatelessWidget {
  const _ContextPanel({
    required this.icon,
    required this.title,
    required this.message,
    required this.toneColor,
    required this.toneForeground,
    this.footer,
  });

  final IconData icon;
  final String title;
  final String message;
  final Color toneColor;
  final Color toneForeground;
  final String? footer;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: toneColor,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, size: 18, color: toneForeground),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  title,
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        color: toneForeground,
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 6),
                Text(
                  message,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: toneForeground,
                        height: 1.35,
                      ),
                ),
                if (footer != null) ...<Widget>[
                  const SizedBox(height: 8),
                  Text(
                    footer!,
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                          color: toneForeground.withValues(alpha: 0.9),
                        ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _OperationalBanner extends StatelessWidget {
  const _OperationalBanner({
    required this.icon,
    required this.label,
    required this.accent,
    required this.value,
    this.compact = false,
  });

  final IconData icon;
  final String label;
  final Color accent;
  final String value;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 12 : 14,
        vertical: compact ? 10 : 12,
      ),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: <Color>[
            accent.withValues(alpha: 0.16),
            accent.withValues(alpha: 0.05),
          ],
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: accent.withValues(alpha: 0.2),
        ),
      ),
      child: Row(
        children: <Widget>[
          Container(
            width: compact ? 32 : 36,
            height: compact ? 32 : 36,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: accent, size: compact ? 18 : 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  label,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: accent,
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusTone {
  const _StatusTone({
    required this.accent,
    required this.icon,
  });

  final Color accent;
  final IconData icon;

  factory _StatusTone.fromStatus(String status, ColorScheme colorScheme) {
    switch (status) {
      case 'CHECKED_IN':
        return const _StatusTone(
          accent: Color(0xFF118C86),
          icon: Icons.how_to_reg_outlined,
        );
      case 'CALLED':
        return const _StatusTone(
          accent: Color(0xFF0E9BB2),
          icon: Icons.campaign_outlined,
        );
      case 'IN_PROGRESS':
        return const _StatusTone(
          accent: Color(0xFF2878FF),
          icon: Icons.play_circle_outline,
        );
      case 'AWAITING_CLOSURE':
        return const _StatusTone(
          accent: Color(0xFF8359F3),
          icon: Icons.assignment_turned_in_outlined,
        );
      case 'AWAITING_PAYMENT':
        return const _StatusTone(
          accent: Color(0xFFB67600),
          icon: Icons.point_of_sale_outlined,
        );
      case 'COMPLETED':
        return const _StatusTone(
          accent: Color(0xFF149B65),
          icon: Icons.check_circle_outline,
        );
      case 'NO_SHOW':
        return const _StatusTone(
          accent: Color(0xFFC74F4F),
          icon: Icons.person_off_outlined,
        );
      case 'CANCELED':
        return _StatusTone(
          accent: colorScheme.error,
          icon: Icons.cancel_outlined,
        );
      default:
        return _StatusTone(
          accent: colorScheme.primary,
          icon: Icons.event_note_outlined,
        );
    }
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({
    required this.status,
    this.compact = false,
  });

  final String status;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final ColorScheme colorScheme = Theme.of(context).colorScheme;
    final _StatusTone tone = _StatusTone.fromStatus(status, colorScheme);

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 10 : 12,
        vertical: compact ? 6 : 8,
      ),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: <Color>[
            tone.accent.withValues(alpha: compact ? 0.18 : 0.2),
            tone.accent.withValues(alpha: compact ? 0.08 : 0.1),
          ],
        ),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: tone.accent.withValues(alpha: 0.24),
        ),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: tone.accent.withValues(alpha: 0.14),
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(
            tone.icon,
            size: compact ? 14 : 16,
            color: tone.accent,
          ),
          const SizedBox(width: 8),
          Text(
            _DashboardFormatters.statusLabel(status),
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: tone.accent,
                  fontWeight: FontWeight.w700,
                ),
          ),
        ],
      ),
    );
  }
}

class _MetaPill extends StatelessWidget {
  const _MetaPill({
    required this.icon,
    required this.label,
  });

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Theme.of(
          context,
        ).colorScheme.surfaceContainerHighest.withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: Colors.black.withValues(alpha: 0.04),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, size: 16),
          const SizedBox(width: 8),
          Flexible(child: Text(label)),
        ],
      ),
    );
  }
}

class _EmptyStateCard extends StatelessWidget {
  const _EmptyStateCard({
    required this.title,
    required this.description,
  });

  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(
                Icons.inventory_2_outlined,
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
            const SizedBox(height: 14),
            Text(
              title,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              description,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    height: 1.35,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PatientSummarySheet extends StatelessWidget {
  const _PatientSummarySheet({
    required this.summary,
    required this.currentAgendaItem,
  });

  final ProfessionalPatientSummary summary;
  final ProfessionalAgendaItem currentAgendaItem;

  @override
  Widget build(BuildContext context) {
    final ColorScheme colorScheme = Theme.of(context).colorScheme;
    final patientName =
        summary.patient.fullName ?? currentAgendaItem.patientName;
    final birthDate = _DashboardFormatters.birthDate(summary.patient.birthDate);
    final ageLabel = _DashboardFormatters.ageLabel(summary.patient.birthDate);
    final contactLabel = summary.patient.contacts
        .map((ProfessionalPatientContact contact) => contact.value.trim())
        .where((String value) => value.isNotEmpty)
        .join(' • ');

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: ListView(
        children: <Widget>[
          Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: <Color>[
                  colorScheme.primaryContainer,
                  Colors.white,
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(28),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Contexto do paciente',
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        color: colorScheme.primary,
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 10),
                Text(
                  patientName,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: <Widget>[
                    if (birthDate != null)
                      _InfoChip(
                        icon: Icons.cake_outlined,
                        label: ageLabel == null
                            ? birthDate
                            : '$birthDate • $ageLabel',
                      ),
                    if (summary.patient.documentNumber?.trim().isNotEmpty ??
                        false)
                      _InfoChip(
                        icon: Icons.badge_outlined,
                        label: summary.patient.documentNumber!,
                      ),
                    _InfoChip(
                      icon: summary.patient.isActive
                          ? Icons.verified_user_outlined
                          : Icons.block_outlined,
                      label: summary.patient.isActive
                          ? 'Cadastro ativo'
                          : 'Cadastro inativo',
                    ),
                  ],
                ),
                if (contactLabel.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 14),
                  Text(
                    contactLabel,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: colorScheme.onSurfaceVariant,
                        ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: <Widget>[
              SizedBox(
                width: 180,
                child: _MetricCard(
                  title: 'Atendimentos com voce',
                  value: summary.relationship.appointmentsWithProfessional,
                  icon: Icons.people_outline,
                ),
              ),
              SizedBox(
                width: 220,
                child: _PatientMomentCard(
                  title: 'Ultima passagem',
                  value: summary.relationship.lastSeenAt == null
                      ? 'Sem registro'
                      : _DashboardFormatters.dateTime(
                          summary.relationship.lastSeenAt!,
                        ),
                  icon: Icons.history_outlined,
                ),
              ),
              SizedBox(
                width: 220,
                child: _PatientMomentCard(
                  title: 'Proximo agendamento',
                  value: summary.relationship.nextAppointmentAt == null
                      ? 'Sem retorno previsto'
                      : _DashboardFormatters.dateTime(
                          summary.relationship.nextAppointmentAt!,
                        ),
                  icon: Icons.event_available_outlined,
                ),
              ),
            ],
          ),
          if (summary.alerts.hasHistoricalIntercurrence ||
              (summary.alerts.lastIntercurrenceSummary?.trim().isNotEmpty ??
                  false)) ...<Widget>[
            const SizedBox(height: 16),
            _ContextPanel(
              icon: Icons.warning_amber_rounded,
              title: 'Historico de intercorrencia',
              message: summary.alerts.lastIntercurrenceSummary
                          ?.trim()
                          .isNotEmpty ??
                      false
                  ? summary.alerts.lastIntercurrenceSummary!
                  : 'Existe contexto clinico anterior que merece revisao antes de conduzir o atendimento.',
              toneColor: colorScheme.errorContainer,
              toneForeground: colorScheme.onErrorContainer,
              footer: summary.alerts.lastIntercurrenceAt == null
                  ? null
                  : 'Ultimo registro em ${_DashboardFormatters.dateTime(summary.alerts.lastIntercurrenceAt!)}',
            ),
          ],
          if (summary.alerts.lastPreparationSummary?.trim().isNotEmpty ??
              false) ...<Widget>[
            const SizedBox(height: 12),
            _ContextPanel(
              icon: Icons.medication_outlined,
              title: 'Preparacao registrada',
              message: summary.alerts.lastPreparationSummary!,
              toneColor: colorScheme.surfaceContainerHighest,
              toneForeground: colorScheme.onSurface,
            ),
          ],
          if (summary.alerts.lastGuidanceSummary?.trim().isNotEmpty ??
              false) ...<Widget>[
            const SizedBox(height: 12),
            _ContextPanel(
              icon: Icons.assignment_turned_in_outlined,
              title: 'Orientacao registrada',
              message: summary.alerts.lastGuidanceSummary!,
              toneColor: colorScheme.secondaryContainer,
              toneForeground: colorScheme.onSecondaryContainer,
            ),
          ],
          if (summary.patient.notes?.trim().isNotEmpty ?? false) ...<Widget>[
            const SizedBox(height: 12),
            _ContextPanel(
              icon: Icons.note_alt_outlined,
              title: 'Notas do cadastro',
              message: summary.patient.notes!,
              toneColor: colorScheme.primaryContainer.withValues(alpha: 0.55),
              toneForeground: colorScheme.onSurface,
            ),
          ],
          const SizedBox(height: 20),
          Text(
            'Ultimos atendimentos',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 10),
          if (summary.recentAppointments.isEmpty)
            const _EmptyStateCard(
              title: 'Sem historico recente',
              description:
                  'Assim que houver atendimentos vinculados a este paciente, eles aparecerao aqui.',
            )
          else
            ...summary.recentAppointments.map(
              (ProfessionalPatientAppointmentSummary appointment) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _PatientAppointmentCard(appointment: appointment),
              ),
            ),
        ],
      ),
    );
  }
}

class _PatientMomentCard extends StatelessWidget {
  const _PatientMomentCard({
    required this.title,
    required this.value,
    required this.icon,
  });

  final String title;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Icon(icon),
            const SizedBox(height: 12),
            Text(
              title,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              value,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    height: 1.35,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PatientAppointmentCard extends StatelessWidget {
  const _PatientAppointmentCard({
    required this.appointment,
  });

  final ProfessionalPatientAppointmentSummary appointment;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        _DashboardFormatters.shortDateTimeRange(
                          appointment.startsAt,
                          appointment.endsAt,
                        ),
                        style:
                            Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        appointment.consultationTypeName,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        appointment.professionalName,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: colorScheme.onSurfaceVariant,
                            ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                _StatusChip(
                  status: appointment.status,
                  compact: true,
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: <Widget>[
                if (appointment.unitName != null &&
                    appointment.unitName!.isNotEmpty)
                  _MetaPill(
                    icon: Icons.location_on_outlined,
                    label: appointment.unitName!,
                  ),
                if (appointment.room != null && appointment.room!.isNotEmpty)
                  _MetaPill(
                    icon: Icons.door_front_door_outlined,
                    label: _DashboardFormatters.roomLabel(appointment.room!),
                  ),
              ],
            ),
            if (appointment.notes?.trim().isNotEmpty ?? false) ...<Widget>[
              const SizedBox(height: 12),
              _ContextPanel(
                icon: Icons.sticky_note_2_outlined,
                title: 'Notas registradas',
                message: appointment.notes!,
                toneColor: colorScheme.surfaceContainerHighest,
                toneForeground: colorScheme.onSurface,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DashboardFormatters {
  static DateTime? _parseDateTime(String? value) {
    if (value == null || value.trim().isEmpty) {
      return null;
    }

    final parsed = DateTime.tryParse(value);
    if (parsed == null) {
      return null;
    }

    return parsed.toLocal();
  }

  static String time(String value) {
    final parsed = _parseDateTime(value);
    if (parsed == null) {
      return value;
    }

    return '${parsed.hour.toString().padLeft(2, '0')}:${parsed.minute.toString().padLeft(2, '0')}';
  }

  static String timeRange(String startsAt, String endsAt) {
    final end = endsAt.trim().isEmpty ? null : time(endsAt);
    final start = time(startsAt);
    return end == null ? start : '$start - $end';
  }

  static String shortDate(String value) {
    final parsed = _parseDateTime(value);
    if (parsed == null) {
      return value;
    }

    return '${parsed.day.toString().padLeft(2, '0')}/${parsed.month.toString().padLeft(2, '0')}';
  }

  static String shortDateTimeRange(String startsAt, String endsAt) {
    return '${shortDate(startsAt)} • ${timeRange(startsAt, endsAt)}';
  }

  static String dayKey(String value) {
    final parts = value.split('-');
    if (parts.length != 3) {
      return value;
    }

    return '${parts[2]}/${parts[1]}/${parts[0]}';
  }

  static String dateTime(String value) {
    return '${shortDate(value)} • ${time(value)}';
  }

  static String? birthDate(String? value) {
    final parsed = _parseDateTime(value);
    if (parsed == null) {
      return value;
    }

    return '${parsed.day.toString().padLeft(2, '0')}/${parsed.month.toString().padLeft(2, '0')}/${parsed.year}';
  }

  static String? ageLabel(String? value) {
    final birthDate = _parseDateTime(value);
    if (birthDate == null) {
      return null;
    }

    final now = DateTime.now();
    int years = now.year - birthDate.year;
    final birthdayReached = now.month > birthDate.month ||
        (now.month == birthDate.month && now.day >= birthDate.day);

    if (!birthdayReached) {
      years -= 1;
    }

    if (years < 0) {
      return null;
    }

    return '$years anos';
  }

  static String statusLabel(String status) {
    switch (status) {
      case 'COMPLETED':
        return 'Concluido';
      case 'NO_SHOW':
        return 'No-show';
      case 'CHECKED_IN':
        return 'Check-in';
      case 'CALLED':
        return 'Chamado';
      case 'IN_PROGRESS':
        return 'Em atendimento';
      case 'AWAITING_CLOSURE':
        return 'Fechamento';
      case 'AWAITING_PAYMENT':
        return 'Na recepcao';
      case 'CONFIRMED':
        return 'Confirmado';
      case 'PENDING_CONFIRMATION':
        return 'Pendente';
      case 'CANCELED':
        return 'Cancelado';
      case 'RESCHEDULED':
        return 'Remarcado';
      default:
        return 'Agendado';
    }
  }

  static String statusSignal(String status) {
    switch (status) {
      case 'CHECKED_IN':
        return 'Paciente pronto para chamada';
      case 'CALLED':
        return 'Paciente direcionado para sala';
      case 'IN_PROGRESS':
        return 'Execucao clinica em andamento';
      case 'AWAITING_CLOSURE':
        return 'Aguardando orientacoes finais';
      case 'AWAITING_PAYMENT':
        return 'Retorno enviado para recepcao';
      case 'COMPLETED':
        return 'Ciclo operacional encerrado';
      case 'NO_SHOW':
        return 'Paciente nao compareceu';
      case 'CANCELED':
        return 'Atendimento cancelado';
      default:
        return 'Atendimento na fila operacional';
    }
  }

  static String nextActionLabel(ProfessionalAgendaItem item) {
    if (canCall(item)) {
      return 'Chamar paciente para a sala';
    }
    if (canStart(item)) {
      return 'Iniciar atendimento';
    }
    if (canPrepareClosure(item)) {
      return 'Levar para fechamento';
    }
    if (canComplete(item)) {
      return 'Enviar para recepcao';
    }
    if (canNoShow(item)) {
      return 'Marcar no-show';
    }

    switch (item.status) {
      case 'AWAITING_PAYMENT':
        return 'Aguardar baixa na recepcao';
      case 'COMPLETED':
        return 'Atendimento encerrado';
      case 'NO_SHOW':
        return 'Nao houve comparecimento';
      default:
        return 'Monitorar fila e contexto do paciente';
    }
  }

  static String stepBadge(String status) {
    final int stepIndex = workflowStepIndex(status);
    if (stepIndex < 0) {
      return 'Etapa operacional';
    }

    const int totalSteps = 5;
    final int current = (stepIndex + 1).clamp(1, totalSteps);
    return 'Etapa $current/$totalSteps';
  }

  static String missionHeadline(ProfessionalAgendaItem item) {
    switch (item.status) {
      case 'CHECKED_IN':
        return 'Paciente pronto para ser chamado: ${item.patientName}';
      case 'CALLED':
        return 'Hora de iniciar o atendimento de ${item.patientName}';
      case 'IN_PROGRESS':
        return 'Atendimento em curso com ${item.patientName}';
      case 'AWAITING_CLOSURE':
        return 'Fechamento clinico pendente para ${item.patientName}';
      case 'AWAITING_PAYMENT':
        return '${item.patientName} retornou para recepcao';
      default:
        return 'Proximo da fila: ${item.patientName}';
    }
  }

  static String missionSupport(ProfessionalAgendaItem item) {
    return '${statusSignal(item.status)}. ${timeRange(item.startsAt, item.endsAt)} • ${item.consultationTypeName}.';
  }

  static String turnMood(ProfessionalDashboardSummary summary) {
    if (summary.inProgress > 0) {
      return 'Ritmo forte';
    }
    if (summary.awaitingClosure > 0) {
      return 'Fechamento em foco';
    }
    if (summary.checkedInWaiting > 0 || summary.calledToRoom > 0) {
      return 'Fila aquecida';
    }
    if (summary.completedToday > 0) {
      return 'Fluxo limpo';
    }
    return 'Pronto para iniciar';
  }

  static String turnLevel(ProfessionalDashboardSummary summary) {
    final total = summary.appointmentsToday;
    if (total == 0) {
      return 'Modo standby';
    }

    final ratio = summary.completedToday / total;
    if (ratio >= 1) {
      return 'Turno finalizado';
    }
    if (ratio >= 0.7) {
      return 'Nivel avancado';
    }
    if (ratio >= 0.35) {
      return 'Ritmo consistente';
    }
    return 'Primeira metade';
  }

  static String activeJourneyStage(ProfessionalDashboardSummary summary) {
    if (summary.inProgress > 0) {
      return 'IN_PROGRESS';
    }
    if (summary.awaitingClosure > 0) {
      return 'AWAITING_CLOSURE';
    }
    if (summary.calledToRoom > 0) {
      return 'CALLED';
    }
    if (summary.checkedInWaiting > 0) {
      return 'CHECKED_IN';
    }
    if (summary.sentToReception > 0) {
      return 'AWAITING_PAYMENT';
    }

    return 'CHECKED_IN';
  }

  static String journeyBanner(ProfessionalDashboardSummary summary) {
    if (summary.inProgress > 0) {
      return 'Atendimento em curso';
    }
    if (summary.awaitingClosure > 0) {
      return 'Fechamento em andamento';
    }
    if (summary.calledToRoom > 0) {
      return 'Paciente a caminho da sala';
    }
    if (summary.checkedInWaiting > 0) {
      return 'Fila pronta para chamar';
    }
    if (summary.sentToReception > 0) {
      return 'Recepcao com retorno';
    }

    return 'Fluxo monitorado';
  }

  static bool isFinalized(String status) {
    return status == 'AWAITING_PAYMENT' ||
        status == 'COMPLETED' ||
        status == 'NO_SHOW' ||
        status == 'CANCELED';
  }

  static bool canCall(ProfessionalAgendaItem item) {
    return item.status == 'CHECKED_IN';
  }

  static bool canStart(ProfessionalAgendaItem item) {
    return item.status == 'CALLED';
  }

  static bool canPrepareClosure(ProfessionalAgendaItem item) {
    return item.status == 'IN_PROGRESS';
  }

  static bool canComplete(ProfessionalAgendaItem item) {
    return item.status == 'AWAITING_CLOSURE';
  }

  static bool canNoShow(ProfessionalAgendaItem item) {
    final startsAt = _parseDateTime(item.startsAt);
    if (!<String>{'BOOKED', 'CONFIRMED', 'RESCHEDULED'}.contains(item.status)) {
      return false;
    }

    return startsAt == null || !startsAt.isAfter(DateTime.now());
  }

  static int workflowStepIndex(String status) {
    switch (status) {
      case 'CHECKED_IN':
        return 0;
      case 'CALLED':
        return 1;
      case 'IN_PROGRESS':
        return 2;
      case 'AWAITING_CLOSURE':
        return 3;
      case 'AWAITING_PAYMENT':
        return 4;
      case 'COMPLETED':
        return 5;
      default:
        return -1;
    }
  }

  static String roomLabel(String value) {
    final normalized = value.trim();
    if (normalized.isEmpty) {
      return '';
    }

    if (RegExp(r'^sala\b', caseSensitive: false).hasMatch(normalized)) {
      return normalized;
    }

    return 'Sala $normalized';
  }
}
