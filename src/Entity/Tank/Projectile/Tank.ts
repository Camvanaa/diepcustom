/*
    DiepCustom - custom tank game server that shares diep.io's WebSocket protocol
    Copyright (C) 2022 ABCxFF (github.com/ABCxFF)

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program. If not, see <https://www.gnu.org/licenses/>
*/

import Barrel from "../Barrel";
import Bullet from "./Bullet";
import { AI, AIState } from "../../AI";
import Drone from "./Drone";
import { Entity } from "../../../Native/Entity";
import { 
    InputFlags, 
    PhysicsFlags, 
    StyleFlags,
    PositionFlags,
    Stat,
    HealthFlags
} from "../../../Const/Enums";
import { EntityStateFlags } from "../../../Native/Entity";
import { TankDefinition } from "../../../Const/TankDefinitions";
import { Inputs } from "../../AI";
import { BarrelBase } from "../TankBody";
import { CameraEntity } from "../../../Native/Camera";
import { AddonById, AddonBarrelDefinitions, modifyAddonBarrelDefinition } from "../Addons";

/**
 * 代表游戏中的坦克形子弹
 */

/**
 * 参数提示
 * "tankDefinitionId" 是tank定义的ID,-1表示随机tankdefinition
 * "isDroneMode" 是是否为drone模式,-1表示随机drone或者bullet模式
 * "baseRotation" 是子弹的初始旋转速度
 */
export default class TankProjectile extends Bullet implements BarrelBase {
    /** 默认旋转速度 */
    public static readonly BASE_ROTATION = 0.1;
    /** 最大休息半径 */
    private static readonly MAX_RESTING_RADIUS = 400;

    /** 坦克的炮管 */
    private tankBarrels: Barrel[] = [];
    /** 相机实体（用于队伍） */
    public cameraEntity!: CameraEntity;
    /** 炮管的装填时间 */
    public reloadTime = 15;
    /** 射击输入控制 */
    public inputs!: Inputs;
    /** 每tick的旋转角度 */
    private rotationPerTick = TankProjectile.BASE_ROTATION;
    /** AI控制器 */
    public ai!: AI;
    /** 是否可以控制无人机 */
    public canControlDrones: boolean = false;
    /** 无人机是否在休息状态 */
    private restCycle = true;
    /** 是否为无人机模式 */
    private readonly isDroneMode: boolean = true;

    public constructor(
        barrel: Barrel, 
        tank: BarrelBase, 
        tankDefinition: TankDefinition | null, 
        shootAngle: number, 
        direction: number = barrel.definition.bullet.baseRotation || TankProjectile.BASE_ROTATION,
        isDroneMode: boolean = false
    ) {
        
        super(barrel, tank, tankDefinition, shootAngle);
        
        this.isDroneMode = isDroneMode;
        this.usePosAngle = isDroneMode;
        
        // 确保继承 tank 的输入
        this.inputs = tank.inputs;
        
        // 初始化相机实体（用于团队）
        this.cameraEntity = tank.cameraEntity;
        
        this.initializeProjectile(barrel, tank, tankDefinition, shootAngle, direction);
    }

    private initializeProjectile(
        barrel: Barrel, 
        tank: BarrelBase, 
        tankDefinition: TankDefinition | null, 
        shootAngle: number, 
        direction: number = barrel.definition.bullet.baseRotation || TankProjectile.BASE_ROTATION
    ): void {
        const bulletDefinition = barrel.definition.bullet;

        // 基础属性设置
        this.baseAccel = barrel.bulletAccel;
        this.setupSpeed(barrel);
        this.rotationPerTick = direction;
        this.cameraEntity = tank.cameraEntity;
        this.canControlDrones = true;

        // 创建炮管
        this.createBarrels(tankDefinition);

        // 设置输入
        this.setupInputs();

        if (this.isDroneMode) {
            this.initializeDroneMode(barrel, tank, bulletDefinition);
        } else {
            this.initializeNormalMode(barrel, tank, bulletDefinition, shootAngle);
        }
    }

    private setupSpeed(barrel: Barrel): void {
        if (this.isDroneMode) {
            this.baseSpeed = barrel.bulletAccel / 3;
            this.baseAccel = barrel.bulletAccel;
        } else {
            this.baseSpeed = barrel.bulletAccel + 30;
            this.baseAccel = barrel.bulletAccel * 6;
        }
    }

    private createBarrels(tankDefinition: TankDefinition | null): void {
        if (!tankDefinition) return;
        
        // 修改所有炮管的装填时间的辅助函数
        const modifyBarrelDef = (barrelDef: any) => {
            if (!barrelDef) return barrelDef;
            return {
                ...barrelDef,
                reload: barrelDef.reload * 2
            };
        };
        
        // 首先创建preAddon（如果存在）
        if (tankDefinition.preAddon) {
            const PreAddonConstructor = AddonById[tankDefinition.preAddon];
            if (PreAddonConstructor) {
                //console.log('Creating preAddon');
                modifyAddonBarrelDefinition(2);  // 将装填时间加倍
                new PreAddonConstructor(this);
                modifyAddonBarrelDefinition(0.5);  // 恢复原始值
            }
        }

        // 创建主炮管
        if (tankDefinition.barrels) {
            for (const barrelDefinition of tankDefinition.barrels) {
                const modifiedBarrelDef = modifyBarrelDef(barrelDefinition);
                //console.log('Creating main barrel with reload:', modifiedBarrelDef.reload);
                const newBarrel = new Barrel(this, modifiedBarrelDef);
                newBarrel.styleData.values.color = this.styleData.values.color;
                this.tankBarrels.push(newBarrel);
            }
        }

        // 最后创建postAddon（如果存在）
        if (tankDefinition.postAddon) {
            const PostAddonConstructor = AddonById[tankDefinition.postAddon];
            if (PostAddonConstructor) {
                //console.log('Creating postAddon:', tankDefinition.postAddon);
                const def = AddonBarrelDefinitions['AutoTurretAddon_turretDefinition'];
                //console.log('Current definition before modification:', def);
                
                modifyAddonBarrelDefinition(2);
                new PostAddonConstructor(this);
                //console.log('Definition on postAddon creation:', AddonBarrelDefinitions['AutoTurretAddon_turretDefinition']);
                modifyAddonBarrelDefinition(0.5);
                
                //console.log('Definition after postAddon creation:', AddonBarrelDefinitions['AutoTurretAddon_turretDefinition']);
            }
        }
    }

    private setupInputs(): void {
        // 继承父实体的输入
        this.inputs = this.tank.inputs;
        this.inputs.flags |= InputFlags.leftclick;
    }

    private initializeDroneMode(barrel: Barrel, tank: BarrelBase, bulletDefinition: any): void {
        this.ai = new AI(this);
        this.setupDroneAI(tank);
        this.setupDronePhysics(bulletDefinition);
        this.setupDroneLifeLength(barrel);
        
        this.baseSpeed /= 3;
        barrel.droneCount += 1;
    }

    private setupDroneAI(tank: BarrelBase): void {
        this.ai.viewRange = 850 * tank.sizeFactor;
        this.ai.targetFilter = (targetPos) => {
            const entities = this.game.entities.collisionManager.retrieve(targetPos.x, targetPos.y, 1, 1);
            for (let i = 0; i < entities.length; ++i) {
                const entity = entities[i];
                if (entity.positionData.values === targetPos && 'inputs' in entity && 'cameraEntity' in entity) {
                    return true;
                }
            }
            return false;
        };
        this.ai.doAimPrediction = true;  // 启用目标预测
    }

    private setupDronePhysics(bulletDefinition: any): void {
        // 检查发射者是否为 TankBody 的实例
        this.physicsData.values.sides = this.tank.rootParent === this.tank ? 1 : 3;
        
        this.physicsData.values.flags &= ~PhysicsFlags.noOwnTeamCollision;
        this.physicsData.values.flags |= PhysicsFlags.onlySameOwnerCollision;
        this.physicsData.values.flags &= ~PhysicsFlags.canEscapeArena;
        this.styleData.values.flags &= ~StyleFlags.hasNoDmgIndicator;
        
        this.physicsData.values.pushFactor = 4;
        this.physicsData.values.absorbtionFactor = bulletDefinition.absorbtionFactor;
    }

    private setupDroneLifeLength(barrel: Barrel): void {
        this.lifeLength = barrel.definition.bullet.lifeLength !== -1 
            ? 88 * barrel.definition.bullet.lifeLength 
            : Infinity;
        this.deathAccelFactor = 1;
    }

    private initializeNormalMode(barrel: Barrel, tank: BarrelBase, bulletDefinition: any, shootAngle: number): void {
        this.setupNormalModeBasics(tank, shootAngle);
        this.setupNormalModePhysics(bulletDefinition, tank);
        this.setupNormalModeStats(bulletDefinition, tank);
        this.positionProjectile(tank, barrel, shootAngle);
    }

    private setupNormalModeBasics(tank: BarrelBase, shootAngle: number): void {
        this.tank = tank;
        this.movementAngle = shootAngle;
        this.relationsData.values.team = this.barrelEntity.relationsData.values.team;
        this.relationsData.values.owner = tank;
    }

    private setupNormalModePhysics(bulletDefinition: any, tank: BarrelBase): void {
        this.physicsData.values.sides = bulletDefinition.sides ?? 1;
        this.physicsData.values.flags |= PhysicsFlags.noOwnTeamCollision | PhysicsFlags.canEscapeArena;
        
        if (tank.positionData.values.flags & PositionFlags.canMoveThroughWalls) {
            this.positionData.values.flags |= PositionFlags.canMoveThroughWalls;
        }
    }

    private setupNormalModeStats(bulletDefinition: any, tank: BarrelBase): void {
        const statLevels = tank.cameraEntity.cameraData?.values.statLevels.values;
        const bulletDamage = statLevels ? statLevels[Stat.BulletDamage] : 0;
        const bulletPenetration = statLevels ? statLevels[Stat.BulletPenetration] : 0;

        this.healthData.values.health = this.healthData.values.maxHealth = (1.5 * bulletPenetration + 2) * bulletDefinition.health;
        this.damagePerTick = (7 + bulletDamage * 3) * bulletDefinition.damage;
        this.damageReduction = 0.25;
        this.lifeLength = bulletDefinition.lifeLength * 72;
    }

    private positionProjectile(tank: BarrelBase, barrel: Barrel, shootAngle: number): void {
        const {x, y} = tank.getWorldPosition();
        const sizeFactor = tank.sizeFactor;
        
        this.positionData.values.x = x + 
            (Math.cos(shootAngle) * barrel.physicsData.values.size) - 
            Math.sin(shootAngle) * barrel.definition.offset * sizeFactor + 
            Math.cos(shootAngle) * (barrel.definition.distance || 0);
            
        this.positionData.values.y = y + 
            (Math.sin(shootAngle) * barrel.physicsData.values.size) + 
            Math.cos(shootAngle) * barrel.definition.offset * sizeFactor + 
            Math.sin(shootAngle) * (barrel.definition.distance || 0);
            
        this.positionData.values.angle = shootAngle;
    }

    public get sizeFactor(): number {
        return this.physicsData.values.size / 50;
    }

    protected tickMixin(tick: number): void {
        super.tick(tick);
    }

    private tickDroneMode(tick: number): void {
        this.ai.tick(tick);
        
        const usingAI = !this.canControlDrones || 
            this.tank.inputs.deleted || 
            (!this.tank.inputs.attemptingShot() && !this.tank.inputs.attemptingRepel());
            
        const inputs = !usingAI ? this.tank.inputs : this.ai.inputs;

        if (usingAI) {
            // 当AI状态为idle时，围绕玦家旋转
            if (this.ai.state === AIState.idle) {
                this.handleIdleDrone();
            } else {
                // 当AI找到目标时，使用AI的输入来控制移动
                this.positionData.angle = Math.atan2(
                    this.ai.inputs.mouse.y - this.positionData.values.y,
                    this.ai.inputs.mouse.x - this.positionData.values.x
                );
                this.restCycle = false;
            }
        } else {
            this.handleActiveDrone(inputs);
        }
    }

    private handleIdleDrone(): void {
        const delta = {
            x: this.positionData.values.x - this.tank.positionData.values.x,
            y: this.positionData.values.y - this.tank.positionData.values.y
        };
        const base = this.baseAccel;

        let unitDist = (delta.x ** 2 + delta.y ** 2) / TankProjectile.MAX_RESTING_RADIUS;
        if (unitDist <= 1 && this.restCycle) {
            this.baseAccel /= 6;
            this.positionData.angle += 0.01 + 0.012 * unitDist;
        } else {
            const offset = Math.atan2(delta.y, delta.x) + Math.PI / 2;
            delta.x = this.tank.positionData.values.x + Math.cos(offset) * this.tank.physicsData.values.size * 1.2 - this.positionData.values.x;
            delta.y = this.tank.positionData.values.y + Math.sin(offset) * this.tank.physicsData.values.size * 1.2 - this.positionData.values.y;
            this.positionData.angle = Math.atan2(delta.y, delta.x);
            if (unitDist < 0.5) this.baseAccel /= 3;
            this.restCycle = (delta.x ** 2 + delta.y ** 2) <= 4 * (this.tank.physicsData.values.size ** 2);
        }

        this.baseAccel = base;
    }

    private handleActiveDrone(inputs: Inputs): void {
        // 使用根实体(root tank)的输入来控制 drone
        const rootTank = (this.tank.rootParent as BarrelBase) || this.tank;
        const mousePosition = rootTank.inputs.mouse;
        
        this.positionData.angle = Math.atan2(
            mousePosition.y - this.positionData.values.y,
            mousePosition.x - this.positionData.values.x
        );
        this.restCycle = false;

        if (this.canControlDrones && inputs.attemptingRepel()) {
            this.positionData.angle += Math.PI;
        }
    }

    private tickNormalMode(tick: number): void {
        super.tick(tick);  // 让父类处理速度控制

        // 只保留生命周期和团队相关的检查
        if (tick - this.spawnTick >= this.lifeLength) {
            this.destroy(true);
        }

        if ((this.relationsData.values.team?.entityState || 0) & EntityStateFlags.needsDelete) {
            this.relationsData.values.team = null;
        }
    }

    public destroy(animate = true) {
        // 如果是无人机模式，减少无人机计数
        if (this.isDroneMode && !animate) {
            this.barrelEntity.droneCount -= 1;
        }

        // 确保所有子炮管都被销毁
        for (const barrel of this.tankBarrels) {
            barrel.destroy();
        }

        // 立即销毁，不等待动画
        super.destroy(animate);
    }

    public tick(tick: number): void {
        this.reloadTime = this.tank.reloadTime;
        // 只有当 rotationPerTick 不为 0 时才旋转
        if (this.rotationPerTick !== 0) {
            this.positionData.angle += this.rotationPerTick;
        }
        
        // 检查 tank 是否已经死亡或被删除
        if (!Entity.exists(this.tank) || this.tank.inputs.deleted) {
            this.destroy(false);  // 使用 false 来立即销毁，不等待动画
            return;
        }

        if (this.isDroneMode) {
            this.tickDroneMode(tick);
        } else {
            this.tickNormalMode(tick);
        }

        if (!Entity.exists(this.barrelEntity)) {
            this.destroy();
            return;
        }

        for (const barrel of this.tankBarrels) {
            barrel.tick(tick);
        }

        this.tickMixin(tick);
    }
} 